import type { Context } from "hono";
import { apiError, type ErrorCode } from "@cfbridge/shared";
import type { Env } from "../env";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    admin?: boolean;
    projectId?: string;
    projectRef?: string;
    apiKeyRole?: "anon" | "service_role";
    anonReadonly?: boolean;
  };
};

export type AppContext = Context<AppEnv>;

export function jsonError(
  c: AppContext,
  status: number,
  code: ErrorCode,
  message: string,
) {
  return c.json(apiError(code, message), status as 400);
}

export function badRequest(c: AppContext, message: string) {
  return jsonError(c, 400, "validation_error", message);
}

export function unauthorized(c: AppContext, message = "Unauthorized") {
  return jsonError(c, 401, "unauthorized", message);
}

export function forbidden(c: AppContext, message = "Forbidden") {
  return jsonError(c, 403, "forbidden", message);
}

export function notFound(c: AppContext, message = "Not found") {
  return jsonError(c, 404, "not_found", message);
}

export function conflict(c: AppContext, message: string) {
  return jsonError(c, 409, "conflict", message);
}

export function upstream(c: AppContext, message: string) {
  return jsonError(c, 502, "upstream_error", message);
}

export function internal(c: AppContext, message = "Internal error") {
  return jsonError(c, 500, "internal_error", message);
}
