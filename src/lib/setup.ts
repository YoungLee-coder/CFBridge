import type { SetupStatus } from "@cfbridge/shared";
import type { Env } from "../env";
import {
  bindSnippet,
  LATEST_VERSION,
  META_DB_NAME,
  MIGRATIONS,
  WORKER_NAME,
} from "./migrations";
import { createD1Database, CfApiError } from "./cf-account";

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS cfbridge_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export type MetaProbe =
  | { state: "missing" }
  | { state: "unreachable"; error: string }
  | { state: "ok"; db: D1Database };

export async function probeMeta(env: Env): Promise<MetaProbe> {
  if (!env.META) return { state: "missing" };
  try {
    await env.META.prepare("SELECT 1 AS ok").first();
    return { state: "ok", db: env.META };
  } catch (e) {
    return {
      state: "unreachable",
      error: e instanceof Error ? e.message : "META D1 is not reachable",
    };
  }
}

async function ensureMigrationsTable(db: D1Database) {
  await db.prepare(MIGRATIONS_TABLE).run();
}

async function bootstrapIfLegacy(db: D1Database) {
  const projects = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
    )
    .first<{ name: string }>();
  if (!projects) return;

  const counted = await db
    .prepare("SELECT COUNT(*) AS n FROM cfbridge_migrations")
    .first<{ n: number }>();
  if ((counted?.n ?? 0) > 0) return;

  // Schema was applied via wrangler migrate; record baseline.
  const first = MIGRATIONS[0];
  if (!first) return;
  await db
    .prepare(
      "INSERT OR IGNORE INTO cfbridge_migrations (id, version) VALUES (?, ?)",
    )
    .bind(first.id, first.version)
    .run();
}

export async function getAppliedMigrations(db: D1Database): Promise<string[]> {
  await ensureMigrationsTable(db);
  await bootstrapIfLegacy(db);
  const { results } = await db
    .prepare("SELECT id FROM cfbridge_migrations ORDER BY version ASC, id ASC")
    .all<{ id: string }>();
  return (results ?? []).map((r) => r.id);
}

export async function getSchemaVersionFromApplied(
  applied: string[],
): Promise<number> {
  let version = 0;
  for (const m of MIGRATIONS) {
    if (applied.includes(m.id)) version = Math.max(version, m.version);
  }
  return version;
}

export async function getSchemaVersion(db: D1Database): Promise<number> {
  const applied = await getAppliedMigrations(db);
  return getSchemaVersionFromApplied(applied);
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

export async function applyPendingMigrations(db: D1Database): Promise<string[]> {
  const applied = new Set(await getAppliedMigrations(db));
  const ran: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const statements = splitStatements(migration.sql);
    for (const stmt of statements) {
      await db.prepare(stmt).run();
    }
    await db
      .prepare(
        "INSERT INTO cfbridge_migrations (id, version) VALUES (?, ?)",
      )
      .bind(migration.id, migration.version)
      .run();
    ran.push(migration.id);
  }

  return ran;
}

export async function buildSetupStatus(
  env: Env,
  opts?: { createdDatabaseId?: string | null },
): Promise<SetupStatus> {
  const probe = await probeMeta(env);
  const meta_bound = probe.state !== "missing";
  const meta_reachable = probe.state === "ok";
  const has_account_credentials = Boolean(
    env.CLOUDFLARE_ACCOUNT_ID &&
      env.CLOUDFLARE_ACCOUNT_ID !== "your_account_id" &&
      env.CLOUDFLARE_API_TOKEN &&
      env.CLOUDFLARE_API_TOKEN !== "your_api_token",
  );

  let schema_version = 0;
  let pending_migrations: string[] = [];

  if (probe.state === "ok") {
    const appliedList = await getAppliedMigrations(probe.db);
    const applied = new Set(appliedList);
    schema_version = await getSchemaVersionFromApplied(appliedList);
    pending_migrations = MIGRATIONS.filter((m) => !applied.has(m.id)).map(
      (m) => m.id,
    );
  } else {
    pending_migrations = MIGRATIONS.map((m) => m.id);
  }

  const needs_migration = meta_reachable && pending_migrations.length > 0;
  const ready = meta_reachable && !needs_migration;
  const created = opts?.createdDatabaseId ?? null;

  return {
    ready,
    meta_bound,
    meta_reachable,
    data_kv_bound: Boolean(env.DATA_KV),
    schema_version,
    latest_version: LATEST_VERSION,
    pending_migrations,
    needs_migration,
    worker_name: WORKER_NAME,
    has_account_credentials,
    bind_snippet: created ? bindSnippet(created) : null,
    created_database_id: created,
  };
}

export async function createMetaDatabase(env: Env): Promise<{
  database_id: string;
  database_name: string;
  bind_snippet: string;
  next_steps: string[];
}> {
  try {
    const db = await createD1Database(env, META_DB_NAME);
    const database_id = db.uuid;
    return {
      database_id,
      database_name: db.name || META_DB_NAME,
      bind_snippet: bindSnippet(database_id),
      next_steps: [
        `打开 Cloudflare 面板：Workers & Pages → ${WORKER_NAME} → Settings → Bindings`,
        `添加 D1：Variable name = META，选择刚创建的 ${META_DB_NAME}`,
        `保存后回到本页点「重新检测」，再「初始化 / 升级数据库」（无需重新部署）`,
      ],
    };
  } catch (e) {
    if (e instanceof CfApiError) throw e;
    throw e;
  }
}
