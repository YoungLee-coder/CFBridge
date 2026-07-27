import { Hono } from "hono";
import type { CreateProjectBody } from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { generateId, generateRef, isValidRef } from "../../lib/crypto";
import { getMeta } from "../../lib/meta";
import {
  toProject,
  type ProjectRow,
  type ResourceRow,
} from "../../lib/db";
import {
  badRequest,
  conflict,
  notFound,
  type AppEnv,
} from "../../lib/http";
import * as cf from "../../lib/cf-account";

const projects = new Hono<AppEnv>();

projects.use("*", requireAdmin);

projects.get("/", async (c) => {
  const { results } = await getMeta(c.env).prepare(
    "SELECT * FROM projects ORDER BY created_at DESC",
  ).all<ProjectRow>();
  return c.json({ projects: (results ?? []).map(toProject) });
});

projects.post("/", async (c) => {
  let body: CreateProjectBody;
  try {
    body = await c.req.json<CreateProjectBody>();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest(c, "name is required");
  }

  let ref = body.ref?.trim().toLowerCase() || generateRef();
  if (!isValidRef(ref)) {
    return badRequest(
      c,
      "ref must be 2-32 chars: lowercase alphanumeric, _ or -",
    );
  }

  const existing = await getMeta(c.env).prepare(
    "SELECT id FROM projects WHERE ref = ?",
  )
    .bind(ref)
    .first();
  if (existing) return conflict(c, `Project ref '${ref}' already exists`);

  const id = generateId();
  const anonReadonly = body.anon_readonly ? 1 : 0;
  await getMeta(c.env).prepare(
    `INSERT INTO projects (id, ref, name, anon_readonly) VALUES (?, ?, ?, ?)`,
  )
    .bind(id, ref, body.name.trim(), anonReadonly)
    .run();

  const row = await getMeta(c.env).prepare("SELECT * FROM projects WHERE id = ?")
    .bind(id)
    .first<ProjectRow>();
  return c.json({ project: toProject(row!) }, 201);
});

projects.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await getMeta(c.env).prepare("SELECT * FROM projects WHERE id = ?")
    .bind(id)
    .first<ProjectRow>();
  if (!row) {
    const byRef = await getMeta(c.env).prepare(
      "SELECT * FROM projects WHERE ref = ?",
    )
      .bind(id)
      .first<ProjectRow>();
    if (!byRef) return notFound(c, "Project not found");
    const resources = await getMeta(c.env).prepare(
      "SELECT * FROM project_resources WHERE project_id = ?",
    )
      .bind(byRef.id)
      .all<ResourceRow>();
    return c.json({
      project: toProject(byRef),
      resources: resources.results ?? [],
    });
  }
  const resources = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE project_id = ?",
  )
    .bind(row.id)
    .all<ResourceRow>();
  return c.json({
    project: toProject(row),
    resources: resources.results ?? [],
  });
});

projects.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await resolveProject(getMeta(c.env), id);
  if (!row) return notFound(c, "Project not found");

  let body: { name?: string; anon_readonly?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  const name = body.name?.trim() ?? row.name;
  const anonReadonly =
    typeof body.anon_readonly === "boolean"
      ? body.anon_readonly
        ? 1
        : 0
      : row.anon_readonly;

  await getMeta(c.env).prepare(
    "UPDATE projects SET name = ?, anon_readonly = ? WHERE id = ?",
  )
    .bind(name, anonReadonly, row.id)
    .run();

  const updated = await getMeta(c.env).prepare(
    "SELECT * FROM projects WHERE id = ?",
  )
    .bind(row.id)
    .first<ProjectRow>();
  return c.json({ project: toProject(updated!) });
});

projects.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await resolveProject(getMeta(c.env), id);
  if (!row) return notFound(c, "Project not found");

  const deleteCf = c.req.query("delete_cf") === "true";
  if (deleteCf) {
    const { results } = await getMeta(c.env).prepare(
      "SELECT * FROM project_resources WHERE project_id = ?",
    )
      .bind(row.id)
      .all<ResourceRow>();
    for (const r of results ?? []) {
      try {
        if (r.kind === "kv") await cf.deleteKvNamespace(c.env, r.cf_id);
        if (r.kind === "d1") await cf.deleteD1Database(c.env, r.cf_id);
      } catch {
        // best-effort cleanup
      }
    }
  }

  await getMeta(c.env).prepare("DELETE FROM api_keys WHERE project_id = ?")
    .bind(row.id)
    .run();
  await getMeta(c.env).prepare("DELETE FROM project_resources WHERE project_id = ?")
    .bind(row.id)
    .run();
  await getMeta(c.env).prepare("DELETE FROM projects WHERE id = ?")
    .bind(row.id)
    .run();

  return c.json({ ok: true });
});

export async function resolveProject(
  db: D1Database,
  idOrRef: string,
): Promise<ProjectRow | null> {
  const byId = await db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .bind(idOrRef)
    .first<ProjectRow>();
  if (byId) return byId;
  return db
    .prepare("SELECT * FROM projects WHERE ref = ?")
    .bind(idOrRef)
    .first<ProjectRow>();
}

export default projects;
