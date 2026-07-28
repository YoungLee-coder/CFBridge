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
import { SHARED_KV_CF_ID, purgeBindingPrefix } from "../../lib/kv-backend";
import { SHARED_META_CF_ID } from "../../lib/d1-backend";
import {
  isMetaCfId,
  isSystemProject,
} from "../../lib/system-project";
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

  const cfId = body.cf_id.trim();
  if (cfId === SHARED_KV_CF_ID || cfId === SHARED_META_CF_ID) {
    return badRequest(
      c,
      `cf_id '${cfId}' is reserved for the system Worker binding; use create (KV) or attach a real Cloudflare resource id`,
    );
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
  // Attach always uses Account REST (dedicated CF resource).
  await getMeta(c.env).prepare(
    `INSERT INTO project_resources (id, project_id, kind, cf_id, name, access_mode)
     VALUES (?, ?, ?, ?, ?, 'rest')`,
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

  const name = body.name.trim();
  let cfId: string;
  let accessMode: "binding" | "rest";

  if (body.kind === "kv") {
    if (!c.env.DATA_KV) {
      return badRequest(
        c,
        "DATA_KV is not bound. Add a KV namespace binding named DATA_KV on this Worker, then retry. (Attach an existing namespace if you need the REST path.)",
      );
    }
    cfId = SHARED_KV_CF_ID;
    accessMode = "binding";
  } else {
    try {
      const db = await cf.createD1Database(c.env, name);
      cfId = db.uuid;
      accessMode = "rest";
    } catch (e) {
      const msg = e instanceof CfApiError ? e.message : "Failed to create resource";
      return upstream(c, msg);
    }
  }

  const id = generateId();
  await getMeta(c.env).prepare(
    `INSERT INTO project_resources (id, project_id, kind, cf_id, name, access_mode)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, project.id, body.kind, cfId, name, accessMode)
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

  if (isSystemProject(project)) {
    return conflict(
      c,
      "System project resources (META / DATA_KV) cannot be detached",
    );
  }

  const resourceId = c.req.param("resourceId");
  const row = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE id = ? AND project_id = ?",
  )
    .bind(resourceId, project.id)
    .first<ResourceRow>();
  if (!row) return notFound(c, "Resource not found");

  const deleteCf = c.req.query("delete_cf") === "true";
  if (deleteCf && row.kind === "d1" && (await isMetaCfId(c.env, row.cf_id))) {
    return conflict(
      c,
      "The META D1 database cannot be deleted via CFBridge",
    );
  }

  if (row.kind === "kv" && row.access_mode === "binding") {
    // Always clear this project's prefix when detaching binding KV.
    try {
      await purgeBindingPrefix(c.env, project.ref);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to purge DATA_KV prefix";
      return upstream(c, msg);
    }
  } else if (deleteCf && row.access_mode !== "binding") {
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
