import { Hono } from "hono";
import {
  isLocale,
  type CreateDataKvResponse,
  type CreateMetaDbResponse,
  type MigrateBody,
  type MigrateResponse,
} from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { CfApiError } from "../../lib/cf-account";
import {
  applyPendingMigrations,
  buildSetupStatus,
  createDataKvNamespace,
  createMetaDatabase,
  probeMeta,
} from "../../lib/setup";
import { invalidateReadyCache } from "../../lib/require-ready";
import { getLocale, setLocale } from "../../lib/settings";
import { ensureSystemProject } from "../../lib/system-project";
import {
  badRequest,
  jsonError,
  upstream,
  type AppEnv,
} from "../../lib/http";

const setup = new Hono<AppEnv>();

function hasAccountCredentials(env: {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}): boolean {
  return Boolean(
    env.CLOUDFLARE_ACCOUNT_ID &&
      env.CLOUDFLARE_ACCOUNT_ID !== "your_account_id" &&
      env.CLOUDFLARE_API_TOKEN &&
      env.CLOUDFLARE_API_TOKEN !== "your_api_token",
  );
}

/** Public: dashboard gates on this before login. */
setup.get("/status", async (c) => {
  const created = c.req.query("created_database_id") || null;
  const createdNs = c.req.query("created_namespace_id") || null;
  const status = await buildSetupStatus(c.env, {
    createdDatabaseId: created,
    createdNamespaceId: createdNs,
  });
  return c.json(status);
});

setup.post("/create-meta-db", requireAdmin, async (c) => {
  if (!hasAccountCredentials(c.env)) {
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

setup.post("/create-data-kv", requireAdmin, async (c) => {
  if (!hasAccountCredentials(c.env)) {
    return badRequest(
      c,
      "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets before creating DATA_KV",
    );
  }

  try {
    const result = await createDataKvNamespace(c.env);
    return c.json(result satisfies CreateDataKvResponse, 201);
  } catch (e) {
    return upstream(
      c,
      e instanceof CfApiError ? e.message : "Failed to create KV namespace",
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

    let systemProject: MigrateResponse["system_project"];
    try {
      const seeded = await ensureSystemProject(c.env, { issueKey: true });
      if (seeded.created || seeded.keys) {
        systemProject = {
          project: seeded.project,
          keys: seeded.keys,
        };
      }
    } catch (e) {
      // Schema is ready; seeding is best-effort.
      console.error(
        "ensureSystemProject failed after migrate:",
        e instanceof Error ? e.message : e,
      );
    }

    const status = await buildSetupStatus(c.env);
    const stored = await getLocale(probe.db);
    const body: MigrateResponse = {
      applied,
      schema_version: status.schema_version,
      latest_version: status.latest_version,
      ready: status.ready,
      locale: stored,
      system_project: systemProject,
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
