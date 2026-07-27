import type { ApiKeyRole, CreateApiKeyResponse } from "@cfbridge/shared";
import { generateApiKey, generateId, sha256Hex } from "./crypto";
import { toApiKeyPublic, type ApiKeyRow } from "./db";

/** Insert a new API key and return public fields + plaintext (once). */
export async function mintApiKey(
  db: D1Database,
  projectId: string,
  name: string,
  role: ApiKeyRole,
): Promise<CreateApiKeyResponse> {
  const { key, prefix } = generateApiKey(role);
  const hash = await sha256Hex(key);
  const id = generateId();

  await db
    .prepare(
      `INSERT INTO api_keys (id, project_id, name, role, key_prefix, key_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, projectId, name, role, prefix, hash)
    .run();

  const row = await db
    .prepare(
      "SELECT id, project_id, name, role, key_prefix, created_at, revoked_at FROM api_keys WHERE id = ?",
    )
    .bind(id)
    .first<ApiKeyRow>();

  return { ...toApiKeyPublic(row!), key };
}
