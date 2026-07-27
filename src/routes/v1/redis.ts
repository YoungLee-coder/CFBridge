import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ApiKeyRole } from "@cfbridge/shared";
import { assertWritable, getBearerToken } from "../../lib/auth";
import { sha256Hex } from "../../lib/crypto";
import type { ResourceRow } from "../../lib/db";
import type { Env } from "../../env";
import { getMeta } from "../../lib/meta";
import type { AppEnv } from "../../lib/http";
import {
  type KvBackend,
  kvBackendDelete,
  kvBackendErrorMessage,
  kvBackendGet,
  kvBackendList,
  kvBackendMdel,
  kvBackendMexists,
  kvBackendMget,
  kvBackendMset,
  kvBackendPut,
  resolveKvBackend,
} from "../../lib/kv-backend";
import { CfApiError } from "../../lib/cf-account";

const WRITE_COMMANDS = new Set([
  "set",
  "setex",
  "del",
  "mset",
  "expire",
]);

class RedisCmdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisCmdError";
  }
}

type ExecCtx = {
  backend: KvBackend;
  role: ApiKeyRole | undefined;
  anonReadonly: boolean | undefined;
};

const redis = new Hono<AppEnv>();

/** Upstash-style auth: Bearer or ?_token= ; errors as { error: string } */
const requireRedisApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const token =
    getBearerToken(c.req.header("Authorization")) ||
    c.req.query("_token")?.trim() ||
    null;
  if (!token) {
    return c.json({ error: "WRONGPASS invalid token" }, 401);
  }

  const hash = await sha256Hex(token);
  const row = await getMeta(c.env)
    .prepare(
      `SELECT k.id, k.project_id, k.role, k.revoked_at, p.anon_readonly, p.ref AS project_ref
       FROM api_keys k
       JOIN projects p ON p.id = k.project_id
       WHERE k.key_hash = ?`,
    )
    .bind(hash)
    .first<{
      id: string;
      project_id: string;
      role: ApiKeyRole;
      revoked_at: string | null;
      anon_readonly: number;
      project_ref: string;
    }>();

  if (!row || row.revoked_at) {
    return c.json({ error: "WRONGPASS invalid token" }, 401);
  }

  const ref = c.req.param("ref");
  if (ref && row.project_ref !== ref) {
    return c.json({ error: "WRONGPASS invalid token" }, 401);
  }

  c.set("projectId", row.project_id);
  c.set("projectRef", row.project_ref);
  c.set("apiKeyRole", row.role);
  c.set("anonReadonly", row.anon_readonly === 1);
  await next();
});

redis.use("*", requireRedisApiKey);

async function getKvResource(
  db: D1Database,
  projectId: string,
): Promise<ResourceRow | null> {
  return db
    .prepare(
      "SELECT * FROM project_resources WHERE project_id = ? AND kind = 'kv'",
    )
    .bind(projectId)
    .first<ResourceRow>();
}

async function resolveBackendForProject(
  env: Env,
  projectId: string,
  projectRef: string,
): Promise<KvBackend> {
  const resource = await getKvResource(getMeta(env), projectId);
  if (!resource) {
    throw new RedisCmdError("ERR no KV resource on this project");
  }
  try {
    return resolveKvBackend(env, {
      accessMode: resource.access_mode === "binding" ? "binding" : "rest",
      cfId: resource.cf_id,
      projectRef,
    });
  } catch (e) {
    throw new RedisCmdError(
      `ERR ${e instanceof Error ? e.message : "KV backend unavailable"}`,
    );
  }
}

function parseTtlSeconds(raw: string, label = "EX"): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new RedisCmdError(
      `ERR invalid expire time in '${label.toLowerCase()}'`,
    );
  }
  if (n < 60) {
    throw new RedisCmdError(
      "ERR expiration must be >= 60 seconds (Cloudflare KV constraint)",
    );
  }
  return n;
}

function keysPatternToPrefix(pattern: string): string {
  if (pattern === "*") return "";
  if (
    pattern.endsWith("*") &&
    !pattern.slice(0, -1).includes("*") &&
    !pattern.includes("?")
  ) {
    return pattern.slice(0, -1);
  }
  throw new RedisCmdError(
    "ERR KEYS only supports '*' or 'prefix*' (no other globs)",
  );
}

async function executeCommand(ctx: ExecCtx, argv: string[]): Promise<unknown> {
  if (argv.length === 0) {
    throw new RedisCmdError("ERR empty command");
  }
  const cmd = argv[0]!.toLowerCase();
  const args = argv.slice(1);

  if (WRITE_COMMANDS.has(cmd)) {
    if (!assertWritable(ctx.role, ctx.anonReadonly)) {
      throw new RedisCmdError("NOPERM write commands are not allowed");
    }
  }

  switch (cmd) {
    case "ping":
      if (args.length === 0) return "PONG";
      if (args.length === 1) return args[0];
      throw new RedisCmdError(
        "ERR wrong number of arguments for 'ping' command",
      );

    case "get": {
      if (args.length !== 1) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'get' command",
        );
      }
      const { value } = await kvBackendGet(ctx.backend, args[0]!);
      return value;
    }

    case "set": {
      if (args.length < 2) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'set' command",
        );
      }
      const key = args[0]!;
      const value = args[1]!;
      let expiration_ttl: number | undefined;
      let i = 2;
      while (i < args.length) {
        const opt = args[i]!.toUpperCase();
        if (opt === "EX") {
          if (i + 1 >= args.length) {
            throw new RedisCmdError("ERR syntax error");
          }
          expiration_ttl = parseTtlSeconds(args[i + 1]!, "EX");
          i += 2;
        } else if (
          opt === "PX" ||
          opt === "NX" ||
          opt === "XX" ||
          opt === "KEEPTTL"
        ) {
          throw new RedisCmdError(`ERR SET option '${opt}' is not supported`);
        } else {
          throw new RedisCmdError("ERR syntax error");
        }
      }
      await kvBackendPut(ctx.backend, key, value, { expiration_ttl });
      return "OK";
    }

    case "setex": {
      if (args.length !== 3) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'setex' command",
        );
      }
      const ttl = parseTtlSeconds(args[1]!, "SETEX");
      await kvBackendPut(ctx.backend, args[0]!, args[2]!, {
        expiration_ttl: ttl,
      });
      return "OK";
    }

    case "del": {
      if (args.length < 1) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'del' command",
        );
      }
      return kvBackendMdel(ctx.backend, args);
    }

    case "exists": {
      if (args.length < 1) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'exists' command",
        );
      }
      return kvBackendMexists(ctx.backend, args);
    }

    case "mget": {
      if (args.length < 1) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'mget' command",
        );
      }
      return kvBackendMget(ctx.backend, args);
    }

    case "mset": {
      if (args.length < 2 || args.length % 2 !== 0) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'mset' command",
        );
      }
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < args.length; i += 2) {
        pairs.push([args[i]!, args[i + 1]!]);
      }
      await kvBackendMset(ctx.backend, pairs);
      return "OK";
    }

    case "expire": {
      if (args.length !== 2) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'expire' command",
        );
      }
      const ttl = parseTtlSeconds(args[1]!, "EXPIRE");
      const { value, metadata } = await kvBackendGet(ctx.backend, args[0]!);
      if (value === null) return 0;
      await kvBackendPut(ctx.backend, args[0]!, value, {
        expiration_ttl: ttl,
        metadata: metadata ?? undefined,
      });
      return 1;
    }

    case "keys": {
      if (args.length !== 1) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'keys' command",
        );
      }
      const prefix = keysPatternToPrefix(args[0]!);
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await kvBackendList(ctx.backend, {
          userPrefix: prefix || undefined,
          limit: 1000,
          cursor,
        });
        for (const k of page.keys) names.push(k.name);
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return names;
    }

    case "scan": {
      if (args.length < 1) {
        throw new RedisCmdError(
          "ERR wrong number of arguments for 'scan' command",
        );
      }
      const cursorIn = args[0]!;
      let match: string | undefined;
      let count = 100;
      let i = 1;
      while (i < args.length) {
        const opt = args[i]!.toUpperCase();
        if (opt === "MATCH") {
          if (i + 1 >= args.length) throw new RedisCmdError("ERR syntax error");
          match = args[i + 1];
          i += 2;
        } else if (opt === "COUNT") {
          if (i + 1 >= args.length) throw new RedisCmdError("ERR syntax error");
          count = Number(args[i + 1]);
          if (!Number.isFinite(count) || count < 1 || count > 1000) {
            throw new RedisCmdError("ERR COUNT must be 1-1000");
          }
          i += 2;
        } else {
          throw new RedisCmdError("ERR syntax error");
        }
      }
      const prefix = match !== undefined ? keysPatternToPrefix(match) : "";
      const page = await kvBackendList(ctx.backend, {
        userPrefix: prefix || undefined,
        limit: count,
        cursor: cursorIn === "0" ? undefined : cursorIn,
      });
      const next = page.list_complete ? "0" : (page.cursor ?? "0");
      return [next, page.keys.map((k) => k.name)];
    }

    default:
      throw new RedisCmdError(`ERR unknown command '${cmd}'`);
  }
}

/** Shared Redis argv runner — used by /v1 data plane and admin browser proxy. */
export async function runRedisArgv(
  env: Env,
  projectId: string,
  argv: string[],
  opts: {
    role?: ApiKeyRole;
    anonReadonly?: boolean;
    projectRef?: string;
    backend?: KvBackend;
  } = {},
): Promise<{ result: unknown } | { error: string }> {
  try {
    let backend = opts.backend;
    if (!backend) {
      let projectRef = opts.projectRef;
      if (!projectRef) {
        const row = await getMeta(env)
          .prepare("SELECT ref FROM projects WHERE id = ?")
          .bind(projectId)
          .first<{ ref: string }>();
        if (!row) throw new RedisCmdError("ERR project not found");
        projectRef = row.ref;
      }
      backend = await resolveBackendForProject(env, projectId, projectRef);
    }
    const result = await executeCommand(
      {
        backend,
        role: opts.role,
        anonReadonly: opts.anonReadonly,
      },
      argv,
    );
    return { result };
  } catch (e) {
    if (e instanceof RedisCmdError) return { error: e.message };
    if (e instanceof CfApiError) return { error: `ERR ${e.message}` };
    return {
      error: `ERR ${kvBackendErrorMessage(e)}`,
    };
  }
}

async function runOne(
  c: {
    env: Env;
    get: (
      key: "projectId" | "projectRef" | "apiKeyRole" | "anonReadonly",
    ) => string | ApiKeyRole | boolean | undefined;
  },
  argv: string[],
  backend?: KvBackend,
): Promise<{ result: unknown } | { error: string }> {
  return runRedisArgv(c.env, c.get("projectId") as string, argv, {
    role: c.get("apiKeyRole") as ApiKeyRole | undefined,
    anonReadonly: c.get("anonReadonly") as boolean | undefined,
    projectRef: c.get("projectRef") as string | undefined,
    backend,
  });
}

function decodeParts(raw: string): string[] {
  if (!raw) return [];
  return raw.split("/").map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
}

function isJsonContent(contentType: string | undefined): boolean {
  return (contentType || "").includes("application/json");
}

redis.post("/pipeline", async (c) => {
  let statements: unknown;
  try {
    statements = await c.req.json();
  } catch {
    return c.json({ error: "ERR invalid JSON body" }, 400);
  }
  if (!Array.isArray(statements) || statements.length === 0) {
    return c.json(
      { error: "ERR pipeline body must be a non-empty array" },
      400,
    );
  }

  let backend: KvBackend;
  try {
    backend = await resolveBackendForProject(
      c.env,
      c.get("projectId") as string,
      c.get("projectRef") as string,
    );
  } catch (e) {
    const msg =
      e instanceof RedisCmdError
        ? e.message
        : `ERR ${kvBackendErrorMessage(e)}`;
    return c.json({ error: msg }, 400);
  }

  const out: Array<{ result: unknown } | { error: string }> = [];
  for (const row of statements) {
    if (!Array.isArray(row) || row.length === 0) {
      out.push({ error: "ERR each pipeline entry must be a non-empty array" });
      continue;
    }
    out.push(await runOne(c, row.map((x) => String(x)), backend));
  }
  return c.json(out);
});

redis.post("/multi-exec", async (c) => {
  return c.json(
    { error: "ERR MULTI/EXEC transactions are not supported" },
    400,
  );
});

/** POST / with JSON array command: ["SET","k","v"] ; HEAD / → 200 */
redis.on(["GET", "POST", "PUT", "HEAD"], "/", async (c) => {
  if (c.req.method === "HEAD") return c.body(null, 200);
  if (c.req.method !== "POST") {
    return c.json({ error: "ERR empty command" }, 400);
  }
  const contentType = c.req.header("Content-Type") || "";
  if (!isJsonContent(contentType)) {
    return c.json(
      { error: "ERR root POST requires JSON command array" },
      400,
    );
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "ERR invalid JSON body" }, 400);
  }
  if (!Array.isArray(body) || body.length === 0) {
    return c.json(
      { error: "ERR command body must be a non-empty array" },
      400,
    );
  }
  const res = await runOne(
    c,
    body.map((x) => String(x)),
  );
  return c.json(res, "error" in res ? 400 : 200);
});

/**
 * Path commands: /get/foo, /set/foo/bar/EX/3600
 * POST with raw body appends value as last arg (Upstash).
 */
redis.on(["GET", "POST", "PUT"], "/:argv{.+}", async (c) => {
  const parts = decodeParts(c.req.param("argv"));
  if (parts.length === 0) {
    return c.json({ error: "ERR empty command" }, 400);
  }

  const method = c.req.method.toUpperCase();
  if (method === "POST" || method === "PUT") {
    const contentType = c.req.header("Content-Type") || "";
    if (!isJsonContent(contentType)) {
      const text = await c.req.text();
      if (text.length > 0) parts.push(text);
      const url = new URL(c.req.url);
      for (const [k, v] of url.searchParams.entries()) {
        if (k === "_token") continue;
        parts.push(k, v);
      }
    }
  }

  const res = await runOne(c, parts);
  return c.json(res, "error" in res ? 400 : 200);
});

export default redis;
