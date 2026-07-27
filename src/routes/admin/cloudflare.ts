import { Hono } from "hono";
import type { CfAccountResource, ListCfResourcesResponse } from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { badRequest, upstream, type AppEnv } from "../../lib/http";
import * as cf from "../../lib/cf-account";
import { CfApiError } from "../../lib/cf-account";

const cloudflare = new Hono<AppEnv>();

cloudflare.use("*", requireAdmin);

cloudflare.get("/resources", async (c) => {
  const kind = c.req.query("kind");
  if (kind !== "kv" && kind !== "d1") {
    return badRequest(c, "kind query must be kv or d1");
  }

  try {
    let resources: CfAccountResource[];
    if (kind === "kv") {
      const namespaces = await cf.listKvNamespaces(c.env);
      resources = namespaces.map((ns) => ({ id: ns.id, name: ns.title }));
    } else {
      const databases = await cf.listD1Databases(c.env);
      resources = databases.map((db) => ({ id: db.uuid, name: db.name }));
    }
    const body: ListCfResourcesResponse = { kind, resources };
    return c.json(body);
  } catch (e) {
    const msg =
      e instanceof CfApiError ? e.message : "Failed to list Cloudflare resources";
    return upstream(c, msg);
  }
});

export default cloudflare;
