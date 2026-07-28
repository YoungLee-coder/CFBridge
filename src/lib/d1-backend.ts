import type { Env } from "../env";
import * as cf from "./cf-account";
import type { D1QueryResult, D1RawResult } from "./cf-account";
import type { ResourceAccessMode } from "@cfbridge/shared";

/** Sentinel stored in project_resources.cf_id for shared META D1 binding. */
export const SHARED_META_CF_ID = "META";

export type D1Backend =
  | { mode: "binding"; db: D1Database }
  | { mode: "rest"; env: Env; databaseId: string };

export function resolveD1Backend(
  env: Env,
  opts: {
    accessMode: ResourceAccessMode;
    cfId: string;
  },
): D1Backend {
  if (opts.accessMode === "binding") {
    if (!env.META) {
      throw new Error("META binding is missing");
    }
    return { mode: "binding", db: env.META };
  }
  return { mode: "rest", env, databaseId: opts.cfId };
}

function bindParams(stmt: D1PreparedStatement, params: unknown[]): D1PreparedStatement {
  if (params.length === 0) return stmt;
  return stmt.bind(...params);
}

function normalizeMeta(
  meta: D1Result["meta"] | undefined,
): D1RawResult["meta"] {
  if (!meta) return undefined;
  return {
    changes: meta.changes,
    last_row_id: meta.last_row_id,
    duration: meta.duration,
    rows_read: meta.rows_read,
    rows_written: meta.rows_written,
    changed_db: meta.changed_db,
    size_after: meta.size_after,
  };
}

async function bindingRawOne(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<D1RawResult> {
  try {
    const result = await bindParams(db.prepare(sql), params).all();
    const objects = (result.results ?? []) as Record<string, unknown>[];
    const columns = objects[0] ? Object.keys(objects[0]) : [];
    const rows = objects.map((row) => columns.map((c) => row[c]));
    return {
      results: { columns, rows },
      success: true,
      meta: normalizeMeta(result.meta),
    };
  } catch (e) {
    return {
      results: { columns: [], rows: [] },
      success: false,
      error: e instanceof Error ? e.message : "D1 statement failed",
    };
  }
}

async function bindingQueryOne(
  db: D1Database,
  sql: string,
  params: unknown[] = [],
): Promise<D1QueryResult> {
  try {
    const result = await bindParams(db.prepare(sql), params).all();
    return {
      results: result.results ?? [],
      success: true,
      meta: result.meta as Record<string, unknown> | undefined,
    };
  } catch (e) {
    return {
      results: [],
      success: false,
      error: e instanceof Error ? e.message : "D1 query failed",
    };
  }
}

type CfD1Single = { sql: string; params?: unknown[] };
type CfD1Body = CfD1Single | { batch: CfD1Single[] };

function asStatements(body: unknown): CfD1Single[] {
  if (!body || typeof body !== "object") return [];
  if ("batch" in body && Array.isArray((body as { batch: unknown }).batch)) {
    return (body as { batch: CfD1Single[] }).batch;
  }
  const single = body as CfD1Single;
  if (typeof single.sql === "string") return [single];
  return [];
}

/** Hrana / internal raw: one SQL string → result parts (CF `/raw` shape). */
export async function d1BackendRaw(
  backend: D1Backend,
  sql: string,
  params: unknown[] = [],
): Promise<D1RawResult[]> {
  if (backend.mode === "binding") {
    return [await bindingRawOne(backend.db, sql, params)];
  }
  return cf.d1Raw(backend.env, backend.databaseId, sql, params);
}

/** Pass-through CF `/query` body against binding or REST. */
export async function d1BackendQueryOfficial(
  backend: D1Backend,
  body: unknown,
): Promise<D1QueryResult[]> {
  if (backend.mode === "rest") {
    return cf.d1QueryOfficial(backend.env, backend.databaseId, body);
  }
  const statements = asStatements(body);
  const out: D1QueryResult[] = [];
  for (const s of statements) {
    out.push(await bindingQueryOne(backend.db, s.sql, s.params ?? []));
  }
  return out;
}

/** Pass-through CF `/raw` body against binding or REST. */
export async function d1BackendRawOfficial(
  backend: D1Backend,
  body: unknown,
): Promise<D1RawResult[]> {
  if (backend.mode === "rest") {
    return cf.d1RawOfficial(backend.env, backend.databaseId, body);
  }
  const statements = asStatements(body);
  const out: D1RawResult[] = [];
  for (const s of statements) {
    out.push(await bindingRawOne(backend.db, s.sql, s.params ?? []));
  }
  return out;
}
