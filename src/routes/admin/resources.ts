import { Hono } from "hono";
import type { AttachResourceBody, CreateResourceBody } from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { generateId } from "../../lib/crypto";
import { getMeta } from "../../lib/meta";
import { toResource, type ResourceRow } from "../../lib/db";
import {
  badRequest,
  conflict,
  notFound,
  upstream,
  type AppEnv,
} from "../../lib/http";
import * as cf from "../../lib/cf-account";
import { CfApiError } from "../../lib/cf-account";
import { resolveProject } from "./projects";

const resources = new Hono<AppEnv>();

resources.use("*", requireAdmin);

resources.get("/:projectId/resources", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");
  const { results } = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE project_id = ?",
  )
    .bind(project.id)
    .all<ResourceRow>();
  return c.json({ resources: (results ?? []).map(toResource) });
});

resources.post("/:projectId/resources/attach", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: AttachResourceBody;
  try {
    body = await c.req.json<AttachResourceBody>();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (body.kind !== "kv" && body.kind !== "d1") {
    return badRequest(c, "kind must be kv or d1");
  }
  if (!body.cf_id || typeof body.cf_id !== "string") {
    return badRequest(c, "cf_id is required");
  }

  const existing = await getMeta(c.env).prepare(
    "SELECT id FROM project_resources WHERE project_id = ? AND kind = ?",
  )
    .bind(project.id, body.kind)
    .first();
  if (existing) {
    return conflict(c, `Project already has a ${body.kind} resource`);
  }

  const id = generateId();
  const name = body.name?.trim() || `${project.ref}-${body.kind}`;
  await getMeta(c.env).prepare(
    `INSERT INTO project_resources (id, project_id, kind, cf_id, name) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, project.id, body.kind, body.cf_id.trim(), name)
    .run();

  const row = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE id = ?",
  )
    .bind(id)
    .first<ResourceRow>();
  return c.json({ resource: toResource(row!) }, 201);
});

resources.post("/:projectId/resources/create", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: CreateResourceBody;
  try {
    body = await c.req.json<CreateResourceBody>();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (body.kind !== "kv" && body.kind !== "d1") {
    return badRequest(c, "kind must be kv or d1");
  }
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest(c, "name is required");
  }

  const existing = await getMeta(c.env).prepare(
    "SELECT id FROM project_resources WHERE project_id = ? AND kind = ?",
  )
    .bind(project.id, body.kind)
    .first();
  if (existing) {
    return conflict(c, `Project already has a ${body.kind} resource`);
  }

  let cfId: string;
  const name = body.name.trim();
  try {
    if (body.kind === "kv") {
      const ns = await cf.createKvNamespace(c.env, name);
      cfId = ns.id;
    } else {
      const db = await cf.createD1Database(c.env, name);
      cfId = db.uuid;
    }
  } catch (e) {
    const msg = e instanceof CfApiError ? e.message : "Failed to create resource";
    return upstream(c, msg);
  }

  const id = generateId();
  await getMeta(c.env).prepare(
    `INSERT INTO project_resources (id, project_id, kind, cf_id, name) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, project.id, body.kind, cfId, name)
    .run();

  const row = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE id = ?",
  )
    .bind(id)
    .first<ResourceRow>();
  return c.json({ resource: toResource(row!) }, 201);
});

resources.delete("/:projectId/resources/:resourceId", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  const resourceId = c.req.param("resourceId");
  const row = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE id = ? AND project_id = ?",
  )
    .bind(resourceId, project.id)
    .first<ResourceRow>();
  if (!row) return notFound(c, "Resource not found");

  const deleteCf = c.req.query("delete_cf") === "true";
  if (deleteCf) {
    try {
      if (row.kind === "kv") await cf.deleteKvNamespace(c.env, row.cf_id);
      if (row.kind === "d1") await cf.deleteD1Database(c.env, row.cf_id);
    } catch (e) {
      const msg =
        e instanceof CfApiError ? e.message : "Failed to delete CF resource";
      return upstream(c, msg);
    }
  }

  await getMeta(c.env).prepare("DELETE FROM project_resources WHERE id = ?")
    .bind(row.id)
    .run();
  return c.json({ ok: true });
});

export default resources;
