import {
  SYSTEM_PROJECT_REF,
  type CreateApiKeyResponse,
  type Project,
} from "@cfbridge/shared";
import type { Env } from "../env";
import { mintApiKey } from "./api-keys";
import { listD1Databases } from "./cf-account";
import { generateId } from "./crypto";
import { toProject, type ProjectRow } from "./db";
import { SHARED_META_CF_ID } from "./d1-backend";
import { SHARED_KV_CF_ID } from "./kv-backend";
import { DATA_KV_NAME, META_DB_NAME } from "./migrations";
import { getMeta } from "./meta";

export const SYSTEM_PROJECT_NAME = "CFBridge";

const META_DATABASE_ID_KEY = "meta_database_id";

export function isSystemProject(project: { ref: string }): boolean {
  return project.ref === SYSTEM_PROJECT_REF;
}

async function getCachedMetaDatabaseId(db: D1Database): Promise<string | null> {
  try {
    const row = await db
      .prepare("SELECT value FROM instance_settings WHERE key = ?")
      .bind(META_DATABASE_ID_KEY)
      .first<{ value: string }>();
    return row?.value?.trim() || null;
  } catch {
    return null;
  }
}

async function setCachedMetaDatabaseId(
  db: D1Database,
  databaseId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO instance_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(META_DATABASE_ID_KEY, databaseId)
    .run();
}

/** Resolve the Cloudflare D1 UUID for the instance META database. */
export async function resolveMetaDatabaseId(env: Env): Promise<string | null> {
  const db = getMeta(env);
  const cached = await getCachedMetaDatabaseId(db);
  if (cached) return cached;

  try {
    const list = await listD1Databases(env);
    const meta = list.find((d) => d.name === META_DB_NAME);
    if (!meta?.uuid) return null;
    await setCachedMetaDatabaseId(db, meta.uuid);
    return meta.uuid;
  } catch {
    return null;
  }
}

/** True when cf_id refers to the instance META D1 (must never delete_cf). */
export async function isMetaCfId(env: Env, cfId: string): Promise<boolean> {
  if (cfId === SHARED_META_CF_ID) return true;
  const id = await resolveMetaDatabaseId(env);
  return id !== null && id === cfId;
}

export interface EnsureSystemProjectResult {
  project: Project;
  created: boolean;
  keys?: { secret: CreateApiKeyResponse };
}

/**
 * Idempotently ensure the reserved CFBridge system project exists with
 * META (binding D1) and DATA_KV (binding KV) attached when available.
 * Uses Worker bindings (same pattern as DATA_KV) — no Account API UUID lookup.
 */
export async function ensureSystemProject(
  env: Env,
  opts?: { issueKey?: boolean },
): Promise<EnsureSystemProjectResult> {
  const issueKey = opts?.issueKey === true;
  const db = getMeta(env);

  let created = false;
  let row = await db
    .prepare("SELECT * FROM projects WHERE ref = ?")
    .bind(SYSTEM_PROJECT_REF)
    .first<ProjectRow>();

  if (!row) {
    const id = generateId();
    await db
      .prepare(
        `INSERT INTO projects (id, ref, name, anon_readonly) VALUES (?, ?, ?, 1)`,
      )
      .bind(id, SYSTEM_PROJECT_REF, SYSTEM_PROJECT_NAME)
      .run();
    created = true;
    row = await db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .bind(id)
      .first<ProjectRow>();
  }

  if (!row) {
    throw new Error("Failed to load system project after insert");
  }

  const projectId = row.id;

  const existingD1 = await db
    .prepare(
      "SELECT id, cf_id, access_mode FROM project_resources WHERE project_id = ? AND kind = 'd1'",
    )
    .bind(projectId)
    .first<{ id: string; cf_id: string; access_mode: string }>();
  if (!existingD1 && env.META) {
    await db
      .prepare(
        `INSERT INTO project_resources (id, project_id, kind, cf_id, name, access_mode)
         VALUES (?, ?, 'd1', ?, ?, 'binding')`,
      )
      .bind(generateId(), projectId, SHARED_META_CF_ID, META_DB_NAME)
      .run();
  } else if (
    existingD1 &&
    env.META &&
    (existingD1.cf_id !== SHARED_META_CF_ID ||
      existingD1.access_mode !== "binding")
  ) {
    // System project D1 is always instance META — upgrade legacy rest+UUID rows.
    await db
      .prepare(
        `UPDATE project_resources
         SET cf_id = ?, name = ?, access_mode = 'binding'
         WHERE id = ?`,
      )
      .bind(SHARED_META_CF_ID, META_DB_NAME, existingD1.id)
      .run();
  }

  const existingKv = await db
    .prepare(
      "SELECT id FROM project_resources WHERE project_id = ? AND kind = 'kv'",
    )
    .bind(projectId)
    .first();
  if (!existingKv && env.DATA_KV) {
    await db
      .prepare(
        `INSERT INTO project_resources (id, project_id, kind, cf_id, name, access_mode)
         VALUES (?, ?, 'kv', ?, ?, 'binding')`,
      )
      .bind(generateId(), projectId, SHARED_KV_CF_ID, DATA_KV_NAME)
      .run();
  }

  let keys: { secret: CreateApiKeyResponse } | undefined;
  if (issueKey) {
    const existingKey = await db
      .prepare(
        `SELECT id FROM api_keys
         WHERE project_id = ? AND revoked_at IS NULL
         LIMIT 1`,
      )
      .bind(projectId)
      .first();
    if (!existingKey) {
      const secret = await mintApiKey(db, projectId, "default", "service_role");
      keys = { secret };
    }
  }

  // Re-read in case created_at etc. matter; row is still valid.
  const fresh =
    (await db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .bind(projectId)
      .first<ProjectRow>()) ?? row;

  return {
    project: toProject(fresh),
    created,
    keys,
  };
}
