import { Hono } from "hono";
import {
  SYSTEM_PROJECT_REF,
  type CreateProjectBody,
  type CreateProjectResponse,
} from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { mintApiKey } from "../../lib/api-keys";
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
import { purgeBindingPrefix } from "../../lib/kv-backend";
import {
  ensureSystemProject,
  isMetaCfId,
  isSystemProject,
} from "../../lib/system-project";

const projects = new Hono<AppEnv>();

projects.use("*", requireAdmin);

projects.get("/", async (c) => {
  try {
    await ensureSystemProject(c.env, { issueKey: false });
  } catch (e) {
    console.error(
      "ensureSystemProject failed on list:",
      e instanceof Error ? e.message : e,
    );
  }
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
  if (ref === SYSTEM_PROJECT_REF) {
    return conflict(
      c,
      `Project ref '${SYSTEM_PROJECT_REF}' is reserved for the system project`,
    );
  }

  const existing = await getMeta(c.env).prepare(
    "SELECT id FROM projects WHERE ref = ?",
  )
    .bind(ref)
    .first();
  if (existing) return conflict(c, `Project ref '${ref}' already exists`);

  const id = generateId();
  // Default publishable keys to read-only unless explicitly opted out.
  const anonReadonly = body.anon_readonly === false ? 0 : 1;
  const db = getMeta(c.env);
  await db
    .prepare(
      `INSERT INTO projects (id, ref, name, anon_readonly) VALUES (?, ?, ?, ?)`,
    )
    .bind(id, ref, body.name.trim(), anonReadonly)
    .run();

  let publishable;
  let secret;
  try {
    publishable = await mintApiKey(db, id, "default", "anon");
    secret = await mintApiKey(db, id, "default", "service_role");
  } catch (e) {
    await db.prepare("DELETE FROM api_keys WHERE project_id = ?").bind(id).run();
    await db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
    throw e;
  }

  const row = await db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .bind(id)
    .first<ProjectRow>();

  const response: CreateProjectResponse = {
    project: toProject(row!),
    keys: { publishable, secret },
  };
  return c.json(response, 201);
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

  if (isSystemProject(row)) {
    return conflict(
      c,
      "The CFBridge system project cannot be deleted",
    );
  }

  const deleteCf = c.req.query("delete_cf") === "true";
  const { results } = await getMeta(c.env).prepare(
    "SELECT * FROM project_resources WHERE project_id = ?",
  )
    .bind(row.id)
    .all<ResourceRow>();

  // Always purge shared-KV prefix so reused refs cannot see old data.
  for (const r of results ?? []) {
    if (r.kind === "kv" && r.access_mode === "binding") {
      try {
        await purgeBindingPrefix(c.env, row.ref);
      } catch {
        // best-effort
      }
    }
  }

  if (deleteCf) {
    for (const r of results ?? []) {
      try {
        if (r.access_mode !== "binding") {
          if (r.kind === "d1" && (await isMetaCfId(c.env, r.cf_id))) {
            continue;
          }
          if (r.kind === "kv") await cf.deleteKvNamespace(c.env, r.cf_id);
          if (r.kind === "d1") await cf.deleteD1Database(c.env, r.cf_id);
        }
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
