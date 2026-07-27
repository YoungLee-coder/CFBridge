import { createMiddleware } from "hono/factory";
import { buildSetupStatus } from "./setup";
import { jsonError, type AppEnv } from "./http";

const READY_TTL_MS = 60_000;

let readyUntil = 0;

export function invalidateReadyCache(): void {
  readyUntil = 0;
}

export function isReadyCached(): boolean {
  return Date.now() < readyUntil;
}

function markReady(): void {
  readyUntil = Date.now() + READY_TTL_MS;
}

export function noteReadyFromStatus(ready: boolean): void {
  if (ready) markReady();
  else invalidateReadyCache();
}

/** Block project/data APIs until Meta D1 is bound and migrated. */
export const requireReady = createMiddleware<AppEnv>(async (c, next) => {
  if (isReadyCached()) {
    await next();
    return;
  }

  const status = await buildSetupStatus(c.env);
  if (status.ready) {
    markReady();
    await next();
    return;
  }

  const message = !status.meta_reachable
    ? "Setup required: bind META D1 to this Worker, then initialize the schema."
    : `Setup required: apply pending migrations (${status.pending_migrations.join(", ")}).`;

  return jsonError(c, 503, "setup_required", message);
});
