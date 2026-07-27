import { createMiddleware } from "hono/factory";
import { buildSetupStatus } from "./setup";
import { jsonError, type AppEnv } from "./http";

/** Block project/data APIs until Meta D1 is bound and migrated. */
export const requireReady = createMiddleware<AppEnv>(async (c, next) => {
  const status = await buildSetupStatus(c.env);
  if (status.ready) {
    await next();
    return;
  }

  const message = !status.meta_reachable
    ? "Setup required: bind META D1 to this Worker, then initialize the schema."
    : `Setup required: apply pending migrations (${status.pending_migrations.join(", ")}).`;

  return jsonError(c, 503, "setup_required", message);
});
