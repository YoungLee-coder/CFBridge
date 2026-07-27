import { Hono } from "hono";
import { requireAdmin } from "../../lib/auth";
import { getMeta } from "../../lib/meta";
import type { ResourceRow } from "../../lib/db";
import {
  badRequest,
  notFound,
  upstream,
  type AppEnv,
} from "../../lib/http";
import * as cf from "../../lib/cf-account";
import { CfApiError } from "../../lib/cf-account";
import { runRedisArgv } from "../v1/redis";
import { resolveProject } from "./projects";

const browser = new Hono<AppEnv>();

browser.use("*", requireAdmin);

async function getD1Resource(
  db: D1Database,
  projectId: string,
): Promise<ResourceRow | null> {
  return db
    .prepare(
      "SELECT * FROM project_resources WHERE project_id = ? AND kind = 'd1'",
    )
    .bind(projectId)
    .first<ResourceRow>();
}

/** Dashboard Redis browser — admin session, service_role privileges. */
browser.post("/:projectId/browser/redis", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest(c, "Invalid JSON body");
  }
  const argv = (body as { argv?: unknown }).argv;
  if (!Array.isArray(argv) || argv.length === 0) {
    return badRequest(c, "argv must be a non-empty array");
  }

  const res = await runRedisArgv(
    c.env,
    project.id,
    argv.map((x) => String(x)),
    { role: "service_role", anonReadonly: false },
  );
  if ("error" in res) {
    if (res.error.includes("no KV resource")) {
      return notFound(c, "No KV resource on this project");
    }
    return badRequest(c, res.error);
  }
  return c.json({ result: res.result });
});

/** Dashboard D1 console — admin session, full SQL access. */
browser.post("/:projectId/browser/d1/query", async (c) => {
  const project = await resolveProject(getMeta(c.env), c.req.param("projectId"));
  if (!project) return notFound(c, "Project not found");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body || typeof body !== "object") {
    return badRequest(c, "Invalid JSON body");
  }
  const obj = body as { sql?: unknown; params?: unknown };
  if (typeof obj.sql !== "string" || !obj.sql.trim()) {
    return badRequest(c, "sql is required");
  }
  const params = Array.isArray(obj.params) ? obj.params : [];

  const resource = await getD1Resource(getMeta(c.env), project.id);
  if (!resource) return notFound(c, "No D1 resource on this project");

  try {
    const result = await cf.d1QueryOfficial(c.env, resource.cf_id, {
      sql: obj.sql,
      params,
    });
    return c.json({
      success: true as const,
      errors: [] as unknown[],
      messages: [] as unknown[],
      result,
    });
  } catch (e) {
    const message =
      e instanceof CfApiError ? e.message : "D1 query failed";
    return upstream(c, message);
  }
});

export default browser;
