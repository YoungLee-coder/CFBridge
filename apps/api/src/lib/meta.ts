import type { Env } from "../env";

/** Resolve META binding; throws if not configured. Prefer after requireReady. */
export function getMeta(env: Env): D1Database {
  if (!env.META) {
    throw new Error("META D1 binding is missing");
  }
  return env.META;
}
