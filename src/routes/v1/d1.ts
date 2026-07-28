import { Hono } from "hono";
import type { ApiKeyRole } from "@cfbridge/shared";
import { assertWritable, requireApiKey } from "../../lib/auth";
import type { ResourceRow } from "../../lib/db";
import { getMeta } from "../../lib/meta";
import {
  notFound,
  unauthorized,
  type AppContext,
  type AppEnv,
} from "../../lib/http";
import { CfApiError } from "../../lib/cf-account";
import {
  d1BackendQueryOfficial,
  d1BackendRaw,
  d1BackendRawOfficial,
  resolveD1Backend,
  type D1Backend,
} from "../../lib/d1-backend";
import {
  bindStmtArgs,
  buildStmtResult,
  evalBatchCond,
  hranaError,
  isWriteSql,
  splitSqlStatements,
  HranaProtoError,
  type HranaBatch,
  type HranaBatchResult,
  type HranaError,
  type HranaStmt,
  type HranaStmtResult,
  type StreamRequest,
  type StreamResult,
  type StreamResponse,
} from "../../lib/hrana";

const d1 = new Hono<AppEnv>();

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

function assertCanWrite(c: AppContext, sql: string): HranaError | null {
  if (!isWriteSql(sql)) return null;
  if (
    assertWritable(
      c.get("apiKeyRole") as ApiKeyRole | undefined,
      c.get("anonReadonly") as boolean | undefined,
    )
  ) {
    return null;
  }
  return hranaError(
    "anon key is read-only on this project",
    "TRANSACTION_CLOSED",
  );
}

async function resolveSql(
  stored: Map<number, string>,
  sql: string | null | undefined,
  sqlId: number | null | undefined,
): Promise<string> {
  const hasSql = sql != null && sql !== "";
  const hasId = sqlId != null;
  if (hasSql === hasId) {
    throw new HranaProtoError(
      "exactly one of sql or sql_id must be provided",
      "SQL_INPUT_ERROR",
    );
  }
  if (hasSql) return sql as string;
  const text = stored.get(sqlId as number);
  if (text === undefined) {
    throw new HranaProtoError(
      `sql_id ${sqlId} is not stored on this stream`,
      "SQL_INPUT_ERROR",
    );
  }
  return text;
}

type ExecCtx = {
  backend: D1Backend;
  checkWrite: (sql: string) => HranaError | null;
};

async function execStmt(
  ctx: ExecCtx,
  stmt: HranaStmt,
  stored: Map<number, string>,
): Promise<HranaStmtResult> {
  const sqlText = await resolveSql(stored, stmt.sql, stmt.sql_id);
  const bound = bindStmtArgs({ ...stmt, sql: sqlText });
  const denied = ctx.checkWrite(bound.sql);
  if (denied) throw new HranaProtoError(denied.message, denied.code ?? null);

  const parts = await d1BackendRaw(ctx.backend, bound.sql, bound.params);
  if (!parts.length) {
    return buildStmtResult([], [], undefined, stmt.want_rows !== false);
  }
  // Multi-statement via /raw is unusual; take the last result set (SQLite-like).
  const last = parts[parts.length - 1]!;
  if (last.success === false || last.error) {
    throw new HranaProtoError(last.error || "D1 statement failed", "SQLITE_ERROR");
  }
  const columns = last.results?.columns ?? [];
  const rows = last.results?.rows ?? [];
  return buildStmtResult(columns, rows, last.meta, stmt.want_rows !== false);
}

async function execBatch(
  ctx: ExecCtx,
  batch: HranaBatch,
  stored: Map<number, string>,
): Promise<HranaBatchResult> {
  const step_results: Array<HranaStmtResult | null> = [];
  const step_errors: Array<HranaError | null> = [];

  for (const step of batch.steps ?? []) {
    if (step.condition) {
      const ok = evalBatchCond(step.condition, step_results, step_errors);
      if (!ok) {
        step_results.push(null);
        step_errors.push(null);
        continue;
      }
    }
    try {
      const result = await execStmt(ctx, step.stmt, stored);
      step_results.push(result);
      step_errors.push(null);
    } catch (e) {
      step_results.push(null);
      step_errors.push(toHranaError(e));
    }
  }

  return { step_results, step_errors };
}

function toHranaError(e: unknown): HranaError {
  if (e instanceof HranaProtoError) {
    return hranaError(e.message, e.code);
  }
  if (e instanceof CfApiError) {
    return hranaError(e.message, "SQLITE_ERROR");
  }
  return hranaError(e instanceof Error ? e.message : "internal error", null);
}

async function handleStreamRequest(
  ctx: ExecCtx,
  req: StreamRequest,
  stored: Map<number, string>,
  closed: { value: boolean },
): Promise<StreamResponse> {
  if (closed.value && req.type !== "close") {
    throw new HranaProtoError("stream is closed", "STREAM_CLOSED");
  }

  switch (req.type) {
    case "close":
      closed.value = true;
      return { type: "close" };

    case "execute":
      return {
        type: "execute",
        result: await execStmt(ctx, req.stmt, stored),
      };

    case "batch":
      return {
        type: "batch",
        result: await execBatch(ctx, req.batch, stored),
      };

    case "sequence": {
      const sqlText = await resolveSql(stored, req.sql, req.sql_id);
      const statements = splitSqlStatements(sqlText);
      for (const s of statements) {
        const denied = ctx.checkWrite(s);
        if (denied) throw new HranaProtoError(denied.message, denied.code ?? null);
        const parts = await d1BackendRaw(ctx.backend, s, []);
        const last = parts[parts.length - 1];
        if (last && (last.success === false || last.error)) {
          throw new HranaProtoError(
            last.error || "D1 sequence statement failed",
            "SQLITE_ERROR",
          );
        }
      }
      return { type: "sequence" };
    }

    case "describe": {
      // D1 REST has no sqlite3_prepare describe; return a minimal stub so
      // clients that probe describe don't hard-fail handshake paths.
      const sqlText = await resolveSql(stored, req.sql, req.sql_id);
      const readonly = !isWriteSql(sqlText);
      return {
        type: "describe",
        result: {
          params: [],
          cols: [],
          is_explain: /^\s*explain\b/i.test(sqlText),
          is_readonly: readonly,
        },
      };
    }

    case "store_sql": {
      if (stored.has(req.sql_id)) {
        throw new HranaProtoError(
          `sql_id ${req.sql_id} is already stored`,
          "SQL_INPUT_ERROR",
        );
      }
      stored.set(req.sql_id, req.sql);
      return { type: "store_sql" };
    }

    case "close_sql":
      stored.delete(req.sql_id);
      return { type: "close_sql" };

    case "get_autocommit":
      return { type: "get_autocommit", is_autocommit: true };

    default:
      throw new HranaProtoError(
        `unknown request type: ${(req as { type: string }).type}`,
        "PROTOCOL",
      );
  }
}

/** Version probe — no auth (matches Turso / libSQL clients). */
d1.get("/v2", (c) => c.body(null, 200));
d1.get("/v3", (c) => c.body(null, 200));

async function pipelineHandler(c: AppContext) {
  // Auth is applied via middleware below for /v2/pipeline and /v3/pipeline.
  let body: { baton?: string | null; requests?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json(hranaError("invalid JSON body", "PROTOCOL"), 400);
  }

  if (body.baton != null && body.baton !== "") {
    const n = Array.isArray(body.requests) ? body.requests.length : 1;
    const err = hranaError(
      "Interactive sessions (baton) are not supported; send execute/batch in a single pipeline",
      "TRANSACTION_CLOSED",
    );
    return c.json(
      {
        baton: null,
        base_url: null,
        results: Array.from({ length: Math.max(n, 1) }, () => ({
          type: "error" as const,
          error: err,
        })),
      },
      200,
    );
  }

  if (!Array.isArray(body.requests)) {
    return c.json(hranaError("requests must be an array", "PROTOCOL"), 400);
  }

  const projectId = c.get("projectId")!;
  const resource = await getD1Resource(getMeta(c.env), projectId);
  if (!resource) {
    return c.json(hranaError("No D1 resource on this project", "SQLITE_ERROR"), 404);
  }

  const checkWrite = (sql: string) => assertCanWrite(c, sql);
  const backend = resolveD1Backend(c.env, {
    accessMode: resource.access_mode === "binding" ? "binding" : "rest",
    cfId: resource.cf_id,
  });
  const ctx: ExecCtx = {
    backend,
    checkWrite,
  };

  const stored = new Map<number, string>();
  const closed = { value: false };
  const results: StreamResult[] = [];

  for (const raw of body.requests) {
    if (!raw || typeof raw !== "object" || !("type" in (raw as object))) {
      results.push({
        type: "error",
        error: hranaError("invalid stream request", "PROTOCOL"),
      });
      continue;
    }
    try {
      const response = await handleStreamRequest(
        ctx,
        raw as StreamRequest,
        stored,
        closed,
      );
      results.push({ type: "ok", response });
    } catch (e) {
      results.push({ type: "error", error: toHranaError(e) });
    }
  }

  return c.json({
    baton: null,
    base_url: null,
    results,
  });
}

// Authenticated libSQL pipelines
d1.use("/v2/pipeline", requireApiKey);
d1.use("/v3/pipeline", requireApiKey);
d1.post("/v2/pipeline", pipelineHandler);
d1.post("/v3/pipeline", pipelineHandler);

// ---------------------------------------------------------------------------
// Cloudflare official D1 REST envelope
// Mirrors POST …/accounts/{account}/d1/database/{id}/query|raw
// Auth: project API Key; database resolved from :ref
// ---------------------------------------------------------------------------

type CfD1Single = { sql: string; params?: unknown[] };
type CfD1Body = CfD1Single | { batch: CfD1Single[] };

function cfOk<T>(result: T) {
  return {
    success: true as const,
    errors: [] as Array<{ code: number; message: string }>,
    messages: [] as Array<{ code: number; message: string }>,
    result,
  };
}

function cfFail(status: number, message: string, code = 1000) {
  return {
    body: {
      success: false as const,
      errors: [{ code, message }],
      messages: [] as Array<{ code: number; message: string }>,
      result: [] as unknown[],
    },
    status,
  };
}

function parseCfD1Body(raw: unknown): {
  ok: true;
  body: CfD1Body;
  statements: CfD1Single[];
} | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "Invalid JSON body" };
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.batch)) {
    if (obj.batch.length === 0) {
      return { ok: false, message: "batch must be a non-empty array" };
    }
    const statements: CfD1Single[] = [];
    for (const item of obj.batch) {
      if (!item || typeof item !== "object") {
        return { ok: false, message: "each batch item must be an object" };
      }
      const s = item as Record<string, unknown>;
      if (typeof s.sql !== "string" || !s.sql) {
        return { ok: false, message: "each batch item requires sql" };
      }
      statements.push({
        sql: s.sql,
        params: Array.isArray(s.params) ? s.params : [],
      });
    }
    return { ok: true, body: { batch: statements }, statements };
  }
  if (typeof obj.sql === "string" && obj.sql) {
    const single: CfD1Single = {
      sql: obj.sql,
      params: Array.isArray(obj.params) ? obj.params : [],
    };
    return { ok: true, body: single, statements: [single] };
  }
  return {
    ok: false,
    message: "body must be { sql, params? } or { batch: [{ sql, params? }] }",
  };
}

async function handleCfD1(
  c: AppContext,
  mode: "query" | "raw",
) {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    const fail = cfFail(400, "Invalid JSON body");
    return c.json(fail.body, fail.status as 400);
  }

  const parsed = parseCfD1Body(rawBody);
  if (!parsed.ok) {
    const fail = cfFail(400, parsed.message);
    return c.json(fail.body, fail.status as 400);
  }

  for (const s of parsed.statements) {
    if (
      isWriteSql(s.sql) &&
      !assertWritable(c.get("apiKeyRole"), c.get("anonReadonly"))
    ) {
      const fail = cfFail(403, "anon key is read-only on this project", 10000);
      return c.json(fail.body, fail.status as 403);
    }
  }

  const projectId = c.get("projectId")!;
  const resource = await getD1Resource(getMeta(c.env), projectId);
  if (!resource) {
    const fail = cfFail(404, "No D1 resource on this project", 7003);
    return c.json(fail.body, fail.status as 404);
  }

  try {
    const backend = resolveD1Backend(c.env, {
      accessMode: resource.access_mode === "binding" ? "binding" : "rest",
      cfId: resource.cf_id,
    });
    const result =
      mode === "query"
        ? await d1BackendQueryOfficial(backend, parsed.body)
        : await d1BackendRawOfficial(backend, parsed.body);
    return c.json(cfOk(result));
  } catch (e) {
    const message =
      e instanceof CfApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : `D1 ${mode} failed`;
    const status =
      e instanceof CfApiError && e.status >= 400 && e.status < 600
        ? e.status
        : 502;
    const fail = cfFail(status, message);
    return c.json(fail.body, fail.status as 502);
  }
}

d1.use("/cf/query", requireApiKey);
d1.use("/cf/raw", requireApiKey);
d1.post("/cf/query", (c) => handleCfD1(c, "query"));
d1.post("/cf/raw", (c) => handleCfD1(c, "raw"));

// Catch unauthenticated data routes with a clear error (don't fall through to SPA).
d1.all("*", (c) => {
  if (!c.req.header("Authorization")) {
    return unauthorized(c, "API key required");
  }
  return notFound(c, "Route not found");
});

export default d1;
