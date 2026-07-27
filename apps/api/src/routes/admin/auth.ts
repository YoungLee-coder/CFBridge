import { Hono } from "hono";
import type { AdminLoginBody } from "@cfbridge/shared";
import {
  clearSessionCookie,
  loginAdmin,
  requireAdmin,
  sessionCookie,
} from "../../lib/auth";
import { badRequest, unauthorized } from "../../lib/http";
import type { AppEnv } from "../../lib/http";

const adminAuth = new Hono<AppEnv>();

adminAuth.post("/login", async (c) => {
  let body: AdminLoginBody;
  try {
    body = await c.req.json<AdminLoginBody>();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }
  if (!body?.password || typeof body.password !== "string") {
    return badRequest(c, "password is required");
  }

  const token = await loginAdmin(
    body.password,
    c.env.ADMIN_PASSWORD,
    c.env.SESSION_SECRET,
  );
  if (!token) return unauthorized(c, "Invalid password");

  c.header("Set-Cookie", sessionCookie(token));
  return c.json({ token, role: "admin" });
});

adminAuth.post("/logout", requireAdmin, async (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});

adminAuth.get("/me", requireAdmin, async (c) => {
  return c.json({ role: "admin" });
});

export default adminAuth;
