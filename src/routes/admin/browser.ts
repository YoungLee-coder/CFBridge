import { Hono } from "hono";
import type {
  D1SchemaColumn,
  D1SchemaResponse,
  D1SchemaTable,
  KvListResponse,
  RedisInspectResponse,
  RedisKeysRequest,
} from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { getMeta } from "../../lib/meta";
import type { ResourceRow } from "../../lib/db";
import type { Env } from "../../env";
import {
  badRequest,
  notFound,
  upstream,
  type AppEnv,
} from "../../lib/http";
import { CfApiError } from "../../lib/cf-account";
import {
  d1BackendQueryOfficial,
  resolveD1Backend,
} from "../../lib/d1-backend";
import {
  type KvBackend,
  kvBackendGet,
  kvBackendList,
  resolveKvBackend,
} from "../../lib/kv-backend";
import { runRedisArgv } from "../v1/redis";
import { resolveProject } from "./projects";

const browser = new Hono<AppEnv>();

browser.use("*", requireAdmin);

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

async function getD1Resource(
  db: D1Database,
  projectId: string,
): Promise<ResourceRow | null> {
  return db
    .prepare(
      "SELECT * FROM project_resources WHERE project_id = ? AND kind = 'd1'",
    )
    .bind(projectId)
    .first<ResourceRow>();
}

async function resolveKvBackendForProject(
  env: Env,
  projectId: string,
  projectRef: string,
): Promise<KvBackend | null> {
  const resource = await getKvResource(getMeta(env), projectId);
  if (!resource) return null;
  try {
    return resolveKvBackend(env, {
      accessMode: resource.access_mode === "binding" ? "binding" : "rest",
      cfId: resource.cf_id,
      projectRef,
    });
  } catch {
    return null;
  }
}

function clampListLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return 100;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 100;
  return Math.min(1000, Math.max(1, n));
}

function quoteSqliteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function mapPragmaRow(row: Record<string, unknown>): D1SchemaColumn {
  return {
    cid: Number(row.cid),
    name: String(row.name),
    type: String(row.type),
    notnull: Number(row.notnull),
    dflt_value: row.dflt_value ?? null,
    pk: Number(row.pk),
  };
}

/** Dashboard Redis browser — admin session, service_role privileges. */
browser.post("/:projectId/browser/redis", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest(c, "Invalid JSON body");
  }
  const argv = (body as { argv?: unknown }).argv;
  if (!Array.isArray(argv) || argv.length === 0) {
    return badRequest(c, "argv must be a non-empty array");
  }

  const res = await runRedisArgv(
    c.env,
    project.id,
    argv.map((x) => String(x)),
    { role: "service_role", anonReadonly: false, projectRef: project.ref },
  );
  if ("error" in res) {
    if (res.error.includes("no KV resource")) {
      return notFound(c, "No KV resource on this project");
    }
    return badRequest(c, res.error);
  }
  return c.json({ result: res.result });
});

/** Dashboard Redis key browser — paginated list with expiration metadata. */
browser.post("/:projectId/browser/redis/keys", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest(c, "Invalid JSON body");
  }
  const req = body as RedisKeysRequest;

  const backend = await resolveKvBackendForProject(c.env, project.id, project.ref);
  if (!backend) return notFound(c, "No KV resource on this project");

  try {
    const page = await kvBackendList(backend, {
      userPrefix: req.prefix || undefined,
      limit: clampListLimit(req.limit),
      cursor: req.cursor,
    });
    const out: KvListResponse = {
      keys: page.keys,
      cursor: page.cursor,
      list_complete: page.list_complete,
    };
    return c.json(out);
  } catch (e) {
    const message =
      e instanceof CfApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "KV list failed";
    return upstream(c, message);
  }
});

/** Dashboard Redis key inspector — value, metadata, TTL. */
browser.post("/:projectId/browser/redis/inspect", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest(c, "Invalid JSON body");
  }
  const key = (body as { key?: unknown }).key;
  if (typeof key !== "string" || !key) {
    return badRequest(c, "key is required");
  }

  const backend = await resolveKvBackendForProject(c.env, project.id, project.ref);
  if (!backend) return notFound(c, "No KV resource on this project");

  try {
    const { value, metadata } = await kvBackendGet(backend, key);
    if (value === null) {
      const out: RedisInspectResponse = {
        key,
        value: null,
        metadata: null,
        ttl: -2,
      };
      return c.json(out);
    }

    const page = await kvBackendList(backend, {
      userPrefix: key,
      limit: 1000,
    });
    const entry = page.keys.find((k) => k.name === key);
    const expiration = entry?.expiration;
    const now = Math.floor(Date.now() / 1000);
    const ttl =
      expiration === undefined ? -1 : Math.max(0, expiration - now);

    const out: RedisInspectResponse = {
      key,
      value,
      metadata,
      ...(expiration !== undefined ? { expiration } : {}),
      ttl,
    };
    return c.json(out);
  } catch (e) {
    const message =
      e instanceof CfApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "KV inspect failed";
    return upstream(c, message);
  }
});

/** Dashboard D1 console — admin session, full SQL access. */
browser.post("/:projectId/browser/d1/query", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest(c, "Invalid JSON body");
  }
  const obj = body as { sql?: unknown; params?: unknown };
  if (typeof obj.sql !== "string" || !obj.sql.trim()) {
    return badRequest(c, "sql is required");
  }
  const params = Array.isArray(obj.params) ? obj.params : [];

  const resource = await getD1Resource(getMeta(c.env), project.id);
  if (!resource) return notFound(c, "No D1 resource on this project");

  try {
    const backend = resolveD1Backend(c.env, {
      accessMode: resource.access_mode === "binding" ? "binding" : "rest",
      cfId: resource.cf_id,
    });
    const result = await d1BackendQueryOfficial(backend, {
      sql: obj.sql,
      params,
    });
    return c.json({
      success: true as const,
      errors: [] as unknown[],
      messages: [] as unknown[],
      result,
    });
  } catch (e) {
    const message =
      e instanceof CfApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "D1 query failed";
    return upstream(c, message);
  }
});

/** Dashboard D1 schema browser — tables, views, and column metadata. */
browser.post("/:projectId/browser/d1/schema", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  const resource = await getD1Resource(getMeta(c.env), project.id);
  if (!resource) return notFound(c, "No D1 resource on this project");

  try {
    const backend = resolveD1Backend(c.env, {
      accessMode: resource.access_mode === "binding" ? "binding" : "rest",
      cfId: resource.cf_id,
    });

    const masterResult = await d1BackendQueryOfficial(backend, {
      sql: `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name`,
    });
    const masterFirst = masterResult[0];
    if (masterFirst && masterFirst.success === false) {
      return upstream(c, masterFirst.error ?? "D1 schema query failed");
    }
    const masterRows = masterFirst?.results ?? [];

    const tables: D1SchemaTable[] = [];
    for (const row of masterRows as Record<string, unknown>[]) {
      const name = String(row.name);
      const type = row.type === "view" ? "view" : "table";
      const pragmaResult = await d1BackendQueryOfficial(backend, {
        sql: `PRAGMA table_info(${quoteSqliteIdentifier(name)})`,
      });
      // D1 authorizes only a subset of introspection; skip tables that refuse PRAGMA
      // (e.g. leftover internal names) instead of failing the whole schema panel.
      if (pragmaResult[0] && pragmaResult[0].success === false) {
        tables.push({ name, type, columns: [] });
        continue;
      }
      const columns = ((pragmaResult[0]?.results ?? []) as Record<string, unknown>[]).map(
        mapPragmaRow,
      );
      tables.push({ name, type, columns });
    }

    const out: D1SchemaResponse = { tables };
    return c.json(out);
  } catch (e) {
    const message =
      e instanceof CfApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "D1 schema failed";
    return upstream(c, message);
  }
});

export default browser;
