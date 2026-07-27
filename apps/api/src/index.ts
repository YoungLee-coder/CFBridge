import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/http";
import { requireReady } from "./lib/require-ready";
import { buildSetupStatus } from "./lib/setup";
import adminAuth from "./routes/admin/auth";
import projects from "./routes/admin/projects";
import resources from "./routes/admin/resources";
import keys from "./routes/admin/keys";
import setup from "./routes/admin/setup";
import settings from "./routes/admin/settings";
import redis from "./routes/v1/redis";
import d1 from "./routes/v1/d1";

const app = new Hono<AppEnv>();

app.use(
  "/admin/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

app.use(
  "/v1/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

app.get("/health", async (c) => {
  const status = await buildSetupStatus(c.env);
  return c.json({
    ok: true,
    ready: status.ready,
    meta_reachable: status.meta_reachable,
    needs_migration: status.needs_migration,
  });
});

app.route("/admin/setup", setup);
app.route("/admin/settings", settings);
app.route("/admin/auth", adminAuth);

app.use("/admin/projects/*", requireReady);
app.use("/admin/projects", requireReady);
app.use("/v1/*", requireReady);

app.route("/admin/projects", projects);
app.route("/admin/projects", resources);
app.route("/admin/projects", keys);

app.route("/v1/:ref/redis", redis);
app.route("/v1/:ref/d1", d1);

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/admin") || path.startsWith("/v1") || path === "/health") {
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
        message: err.message || "Internal error",
      },
    },
    500,
  );
});

export default app;
