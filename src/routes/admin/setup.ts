import { Hono } from "hono";
import {
  isLocale,
  type CreateMetaDbResponse,
  type MigrateBody,
  type MigrateResponse,
} from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { CfApiError } from "../../lib/cf-account";
import {
  applyPendingMigrations,
  buildSetupStatus,
  createMetaDatabase,
  probeMeta,
} from "../../lib/setup";
import { invalidateReadyCache } from "../../lib/require-ready";
import { getLocale, setLocale } from "../../lib/settings";
import {
  badRequest,
  jsonError,
  upstream,
  type AppEnv,
} from "../../lib/http";

const setup = new Hono<AppEnv>();

/** Public: dashboard gates on this before login. */
setup.get("/status", async (c) => {
  const created = c.req.query("created_database_id") || null;
  const status = await buildSetupStatus(c.env, {
    createdDatabaseId: created,
  });
  return c.json(status);
});

setup.post("/create-meta-db", requireAdmin, async (c) => {
  if (
    !c.env.CLOUDFLARE_ACCOUNT_ID ||
    c.env.CLOUDFLARE_ACCOUNT_ID === "your_account_id" ||
    !c.env.CLOUDFLARE_API_TOKEN ||
    c.env.CLOUDFLARE_API_TOKEN === "your_api_token"
  ) {
    return badRequest(
      c,
      "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets before creating Meta D1",
    );
  }

  try {
    const result = await createMetaDatabase(c.env);
    return c.json(result satisfies CreateMetaDbResponse, 201);
  } catch (e) {
    return upstream(
      c,
      e instanceof CfApiError ? e.message : "Failed to create D1 database",
    );
  }
});

setup.post("/migrate", requireAdmin, async (c) => {
  const probe = await probeMeta(c.env);
  if (probe.state === "missing") {
    return jsonError(
      c,
      503,
      "setup_required",
      "META D1 is not bound. Create a D1 database and bind it as META in the Cloudflare Dashboard (Settings → Bindings), then recheck.",
    );
  }
  if (probe.state === "unreachable") {
    return jsonError(
      c,
      503,
      "setup_required",
      `META D1 is bound but unreachable: ${probe.error}`,
    );
  }

  const raw = await c.req.json<MigrateBody>().catch(() => ({} as MigrateBody));
  if (raw.locale !== undefined && !isLocale(raw.locale)) {
    return badRequest(c, 'locale must be "en" or "zh-CN"');
  }
  const locale = raw.locale;

  try {
    const applied = await applyPendingMigrations(probe.db);
    if (locale) {
      await setLocale(probe.db, locale);
    }
    invalidateReadyCache();
    const status = await buildSetupStatus(c.env);
    const stored = await getLocale(probe.db);
    const body: MigrateResponse = {
      applied,
      schema_version: status.schema_version,
      latest_version: status.latest_version,
      ready: status.ready,
      locale: stored,
    };
    return c.json(body);
  } catch (e) {
    return jsonError(
      c,
      500,
      "internal_error",
      e instanceof Error ? e.message : "Migration failed",
    );
  }
});

export default setup;
