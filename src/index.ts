import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/http";
import { requireReady, isReadyCached, noteReadyFromStatus } from "./lib/require-ready";
import { buildSetupStatus } from "./lib/setup";
import adminAuth from "./routes/admin/auth";
import projects from "./routes/admin/projects";
import resources from "./routes/admin/resources";
import keys from "./routes/admin/keys";
import browser from "./routes/admin/browser";
import setup from "./routes/admin/setup";
import settings from "./routes/admin/settings";
import cloudflare from "./routes/admin/cloudflare";
import redis from "./routes/v1/redis";
import d1 from "./routes/v1/d1";
import { registerDocsRoutes } from "./routes/docs";

const app = new Hono<AppEnv>();

registerDocsRoutes(app);

/** Admin: only same-origin (Dashboard). Credentials allowed for session cookie. */
app.use(
  "/admin/*",
  cors({
    origin: (origin, c) => {
      if (!origin) return null;
      try {
        if (origin === new URL(c.req.url).origin) return origin;
      } catch {
        /* ignore */
      }
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

/** Data plane: Bearer API keys from any origin; no cookies. */
app.use(
  "/v1/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400,
  }),
);

app.get("/health", async (c) => {
  // Warm ready cache for requireReady without leaking internal setup state.
  if (!isReadyCached()) {
    try {
      const status = await buildSetupStatus(c.env);
      noteReadyFromStatus(status.ready);
    } catch {
      /* health stays minimal */
    }
  }
  return c.json({ ok: true });
});

app.route("/admin/setup", setup);
app.route("/admin/settings", settings);
app.route("/admin/auth", adminAuth);

app.use("/admin/projects/*", requireReady);
app.use("/admin/projects", requireReady);
app.use("/admin/cloudflare/*", requireReady);
app.use("/admin/cloudflare", requireReady);
app.use("/v1/*", requireReady);

app.route("/admin/projects", projects);
app.route("/admin/projects", resources);
app.route("/admin/projects", keys);
app.route("/admin/projects", browser);
app.route("/admin/cloudflare", cloudflare);

app.route("/v1/:ref/redis", redis);
app.route("/v1/:ref/d1", d1);

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (
    path.startsWith("/admin") ||
    path.startsWith("/v1") ||
    path === "/health" ||
    path === "/llms.txt" ||
    path === "/llms-full.txt" ||
    path.startsWith("/docs/")
  ) {
    return c.json(
      { error: { code: "not_found", message: "Route not found" } },
      404,
    );
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      error: {
        code: "internal_error",
        message: "Internal error",
      },
    },
    500,
  );
});

export default app;
