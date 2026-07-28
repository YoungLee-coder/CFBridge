import { createMiddleware } from "hono/factory";
import type { ApiKeyRole } from "@cfbridge/shared";
import {
  createAdminSessionToken,
  sha256Hex,
  timingSafeEqual,
  verifyAdminSessionToken,
} from "./crypto";
import { forbidden, unauthorized } from "./http";
import type { AppEnv } from "./http";
import { getMeta } from "./meta";

const COOKIE_NAME = "cfbridge_session";

export function getBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export function parseCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(
  token: string,
  opts?: { maxAge?: number; secure?: boolean },
): string {
  const maxAge = opts?.maxAge ?? 60 * 60 * 24 * 7;
  const secure = opts?.secure ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(opts?: { secure?: boolean }): string {
  const secure = opts?.secure ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Prefer Secure on HTTPS; omit on local HTTP wrangler so cookies still stick. */
export function cookieSecureFromRequest(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function loginAdmin(
  password: string,
  adminPassword: string,
  sessionSecret: string,
): Promise<string | null> {
  if (!timingSafeEqual(password, adminPassword)) return null;
  return createAdminSessionToken(sessionSecret);
}

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const bearer = getBearerToken(c.req.header("Authorization"));
  const cookie = parseCookie(c.req.header("Cookie"), COOKIE_NAME);
  const token = bearer || cookie;
  if (!token) return unauthorized(c, "Admin session required");

  const ok = await verifyAdminSessionToken(c.env.SESSION_SECRET, token);
  if (!ok) return unauthorized(c, "Invalid or expired admin session");

  c.set("admin", true);
  await next();
});

interface ApiKeyRow {
  id: string;
  project_id: string;
  role: ApiKeyRole;
  revoked_at: string | null;
  anon_readonly: number;
  project_ref: string;
}

export const requireApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) return unauthorized(c, "API key required");

  const hash = await sha256Hex(token);
  const row = await getMeta(c.env).prepare(
    `SELECT k.id, k.project_id, k.role, k.revoked_at, p.anon_readonly, p.ref AS project_ref
     FROM api_keys k
     JOIN projects p ON p.id = k.project_id
     WHERE k.key_hash = ?`,
  )
    .bind(hash)
    .first<ApiKeyRow>();

  if (!row || row.revoked_at) {
    return unauthorized(c, "Invalid API key");
  }

  const ref = c.req.param("ref");
  if (ref && row.project_ref !== ref) {
    return forbidden(c, "API key does not match project");
  }

  c.set("projectId", row.project_id);
  c.set("projectRef", row.project_ref);
  c.set("apiKeyRole", row.role);
  c.set("anonReadonly", row.anon_readonly === 1);
  await next();
});

export function assertWritable(
  role: ApiKeyRole | undefined,
  anonReadonly: boolean | undefined,
): boolean {
  if (role === "service_role") return true;
  if (role === "anon" && anonReadonly) return false;
  return true;
}
