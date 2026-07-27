export type ApiKeyRole = "anon" | "service_role";
export type ResourceKind = "kv" | "d1" | "r2";
/** KV: binding = shared DATA_KV; rest = Account API to a dedicated namespace. D1 is always rest. */
export type ResourceAccessMode = "binding" | "rest";
export type Locale = "en" | "zh-CN";

export const LOCALES: Locale[] = ["en", "zh-CN"];
export const DEFAULT_LOCALE: Locale = "zh-CN";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN";
}

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "upstream_error"
  | "setup_required"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export interface Project {
  id: string;
  ref: string;
  name: string;
  anon_readonly: boolean;
  created_at: string;
}

export interface ProjectResource {
  id: string;
  project_id: string;
  kind: ResourceKind;
  /** For KV binding mode this is the sentinel "DATA_KV"; otherwise a CF resource id. */
  cf_id: string;
  name: string;
  access_mode: ResourceAccessMode;
  created_at: string;
}

export interface ApiKeyPublic {
  id: string;
  project_id: string;
  name: string;
  role: ApiKeyRole;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
}

export interface CreateProjectBody {
  name: string;
  ref?: string;
  /** Defaults to true when omitted. */
  anon_readonly?: boolean;
}

export interface CreateProjectResponse {
  project: Project;
  /** Plaintext keys returned only on create. */
  keys: {
    publishable: CreateApiKeyResponse;
    secret: CreateApiKeyResponse;
  };
}

export interface AttachResourceBody {
  kind: "kv" | "d1";
  cf_id: string;
  name?: string;
}

export interface CreateResourceBody {
  kind: "kv" | "d1";
  name: string;
}

/** Account-level Cloudflare KV namespace or D1 database for attach picker. */
export interface CfAccountResource {
  id: string;
  name: string;
}

export interface ListCfResourcesResponse {
  kind: "kv" | "d1";
  resources: CfAccountResource[];
}

export interface CreateApiKeyBody {
  name: string;
  role: ApiKeyRole;
}

export interface CreateApiKeyResponse extends ApiKeyPublic {
  key: string;
}

export interface AdminLoginBody {
  password: string;
}

export interface SetupStatus {
  ready: boolean;
  meta_bound: boolean;
  meta_reachable: boolean;
  /** Shared project-data KV binding (required to create fast-path KV resources). */
  data_kv_bound: boolean;
  schema_version: number;
  latest_version: number;
  pending_migrations: string[];
  needs_migration: boolean;
  worker_name: string;
  has_account_credentials: boolean;
  bind_snippet: string | null;
  created_database_id: string | null;
}

export interface CreateMetaDbResponse {
  database_id: string;
  database_name: string;
  bind_snippet: string;
  next_steps: string[];
}

export interface MigrateBody {
  locale?: Locale;
}

export interface MigrateResponse {
  applied: string[];
  schema_version: number;
  latest_version: number;
  ready: boolean;
  locale: Locale | null;
}

export interface InstanceSettings {
  locale: Locale | null;
}

export interface UpdateSettingsBody {
  locale: Locale;
}

export interface KvListResponse {
  keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
  cursor?: string;
  list_complete: boolean;
}

export function apiError(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}
