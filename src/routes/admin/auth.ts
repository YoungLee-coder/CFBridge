import { Hono } from "hono";
import type { AdminLoginBody } from "@cfbridge/shared";
import {
  clearSessionCookie,
  cookieSecureFromRequest,
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

  const secure = cookieSecureFromRequest(c.req.url);
  c.header("Set-Cookie", sessionCookie(token, { secure }));
  // token kept for curl / programmatic Bearer clients; Dashboard uses HttpOnly cookie only
  return c.json({ token, role: "admin" });
});

adminAuth.post("/logout", requireAdmin, async (c) => {
  const secure = cookieSecureFromRequest(c.req.url);
  c.header("Set-Cookie", clearSessionCookie({ secure }));
  return c.json({ ok: true });
});

adminAuth.get("/me", requireAdmin, async (c) => {
  return c.json({ role: "admin" });
});

export default adminAuth;
