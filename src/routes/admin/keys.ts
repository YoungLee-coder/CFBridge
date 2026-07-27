import { Hono } from "hono";
import type { CreateApiKeyBody } from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { mintApiKey } from "../../lib/api-keys";
import { getMeta } from "../../lib/meta";
import { toApiKeyPublic, type ApiKeyRow } from "../../lib/db";
import { badRequest, notFound, type AppEnv } from "../../lib/http";
import { resolveProject } from "./projects";

const keys = new Hono<AppEnv>();

keys.use("*", requireAdmin);

keys.get("/:projectId/keys", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  const { results } = await getMeta(c.env).prepare(
    "SELECT id, project_id, name, role, key_prefix, created_at, revoked_at FROM api_keys WHERE project_id = ? ORDER BY created_at DESC",
  )
    .bind(project.id)
    .all<ApiKeyRow>();
  return c.json({ keys: (results ?? []).map(toApiKeyPublic) });
});

keys.post("/:projectId/keys", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: CreateApiKeyBody;
  try {
    body = await c.req.json<CreateApiKeyBody>();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest(c, "name is required");
  }
  if (body.role !== "anon" && body.role !== "service_role") {
    return badRequest(c, "role must be anon or service_role");
  }

  const created = await mintApiKey(
    getMeta(c.env),
    project.id,
    body.name.trim(),
    body.role,
  );
  return c.json(created, 201);
});

keys.post("/:projectId/keys/:keyId/revoke", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  const keyId = c.req.param("keyId");
  const row = await getMeta(c.env).prepare(
    "SELECT id, project_id, name, role, key_prefix, created_at, revoked_at FROM api_keys WHERE id = ? AND project_id = ?",
  )
    .bind(keyId, project.id)
    .first<ApiKeyRow>();
  if (!row) return notFound(c, "API key not found");
  if (row.revoked_at) {
    return c.json({ key: toApiKeyPublic(row) });
  }

  await getMeta(c.env).prepare(
    "UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?",
  )
    .bind(keyId)
    .run();

  const updated = await getMeta(c.env).prepare(
    "SELECT id, project_id, name, role, key_prefix, created_at, revoked_at FROM api_keys WHERE id = ?",
  )
    .bind(keyId)
    .first<ApiKeyRow>();
  return c.json({ key: toApiKeyPublic(updated!) });
});

export default keys;
