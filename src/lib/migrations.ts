export interface Migration {
  id: string;
  version: number;
  sql: string;
}

/** Keep in sync with migrations/*.sql */
export const MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  anon_readonly INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_resources (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('kv', 'd1', 'r2')),
  cf_id TEXT NOT NULL,
  name TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'rest' CHECK (access_mode IN ('binding', 'rest')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, kind)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('anon', 'service_role')),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS instance_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_project_resources_project ON project_resources(project_id);
`.trim(),
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);

export const WORKER_NAME = "cfbridge";
export const META_DB_NAME = "cfbridge-meta";
export const DATA_KV_NAME = "cfbridge-data";

/** Instructions for binding META in the Cloudflare Dashboard (no redeploy). */
export function bindSnippet(databaseId: string): string {
  return `Cloudflare Dashboard
→ Workers & Pages → ${WORKER_NAME}
→ Settings → Bindings → Add → D1 database

Variable name: META
Database: ${META_DB_NAME}
database_id: ${databaseId}

Save. Then return here and click Recheck (no redeploy needed).`;
}

/** Instructions for binding shared DATA_KV (Redis fast path). */
export function dataKvBindSnippet(): string {
  return `Cloudflare Dashboard
→ Workers & Pages → ${WORKER_NAME}
→ Settings → Bindings → Add → KV namespace

Variable name: DATA_KV
Namespace: ${DATA_KV_NAME} (create if needed)

Save. Then return here and click Recheck (no redeploy needed).`;
}
