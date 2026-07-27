import { Hono } from "hono";
import {
  isLocale,
  type InstanceSettings,
  type UpdateSettingsBody,
} from "@cfbridge/shared";
import { requireAdmin } from "../../lib/auth";
import { badRequest, type AppEnv } from "../../lib/http";
import { getLocale, setLocale } from "../../lib/settings";
import { probeMeta } from "../../lib/setup";

const settings = new Hono<AppEnv>();

/** Public: dashboard needs locale before login. */
settings.get("/", async (c) => {
  const probe = await probeMeta(c.env);
  if (probe.state !== "ok") {
    const body: InstanceSettings = { locale: null };
    return c.json(body);
  }
  const locale = await getLocale(probe.db);
  const body: InstanceSettings = { locale };
  return c.json(body);
});

settings.patch("/", requireAdmin, async (c) => {
  const probe = await probeMeta(c.env);
  if (probe.state !== "ok") {
    return badRequest(c, "META D1 is not reachable");
  }

  let body: UpdateSettingsBody;
  try {
    body = await c.req.json<UpdateSettingsBody>();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  if (!isLocale(body.locale)) {
    return badRequest(c, 'locale must be "en" or "zh-CN"');
  }

  await setLocale(probe.db, body.locale);
  const response: InstanceSettings = { locale: body.locale };
  return c.json(response);
});

export default settings;
