import type {
  ApiErrorBody,
  ApiKeyPublic,
  CreateApiKeyResponse,
  CreateDataKvResponse,
  CreateMetaDbResponse,
  CreateProjectResponse,
  D1SchemaResponse,
  InstanceSettings,
  KvListResponse,
  ListCfResourcesResponse,
  Locale,
  MigrateResponse,
  Project,
  ProjectResource,
  RedisInspectResponse,
  SetupStatus,
} from "@cfbridge/shared";

/** Legacy localStorage key — cleared on load so old sessions don't linger. */
const LEGACY_TOKEN_KEY = "cfbridge_admin_token";

try {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
} catch {
  /* ignore quota / private mode */
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  // Session is HttpOnly cookie only; never send Bearer from localStorage.
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!res.ok) {
    const err = json as ApiErrorBody | null;
    throw new ApiClientError(
      res.status,
      err?.error?.code || "unknown",
      err?.error?.message || res.statusText || "Request failed",
    );
  }
  return json as T;
}

export const api = {
  setupStatus(opts?: {
    createdDatabaseId?: string | null;
    createdNamespaceId?: string | null;
  }) {
    const params = new URLSearchParams();
    if (opts?.createdDatabaseId) {
      params.set("created_database_id", opts.createdDatabaseId);
    }
    if (opts?.createdNamespaceId) {
      params.set("created_namespace_id", opts.createdNamespaceId);
    }
    const q = params.toString() ? `?${params}` : "";
    return request<SetupStatus>(`/admin/setup/status${q}`);
  },
  createMetaDb() {
    return request<CreateMetaDbResponse>("/admin/setup/create-meta-db", {
      method: "POST",
    });
  },
  createDataKv() {
    return request<CreateDataKvResponse>("/admin/setup/create-data-kv", {
      method: "POST",
    });
  },
  migrate(locale?: Locale) {
    return request<MigrateResponse>("/admin/setup/migrate", {
      method: "POST",
      body: JSON.stringify(locale ? { locale } : {}),
    });
  },
  getSettings() {
    return request<InstanceSettings>("/admin/settings");
  },
  updateLocale(locale: Locale) {
    return request<InstanceSettings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ locale }),
    });
  },
  login(password: string) {
    return request<{ token: string; role: string }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },
  me() {
    return request<{ role: string }>("/admin/auth/me");
  },
  logout() {
    return request<{ ok: boolean }>("/admin/auth/logout", { method: "POST" });
  },
  listProjects() {
    return request<{ projects: Project[] }>("/admin/projects");
  },
  createProject(body: {
    name: string;
    ref?: string;
    anon_readonly?: boolean;
  }) {
    return request<CreateProjectResponse>("/admin/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  getProject(idOrRef: string) {
    return request<{ project: Project; resources: ProjectResource[] }>(
      `/admin/projects/${idOrRef}`,
    );
  },
  updateProject(
    idOrRef: string,
    body: { name?: string; anon_readonly?: boolean },
  ) {
    return request<{ project: Project }>(`/admin/projects/${idOrRef}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  deleteProject(idOrRef: string, deleteCf = false) {
    const q = deleteCf ? "?delete_cf=true" : "";
    return request<{ ok: boolean }>(`/admin/projects/${idOrRef}${q}`, {
      method: "DELETE",
    });
  },
  attachResource(
    projectId: string,
    body: { kind: "kv" | "d1"; cf_id: string; name?: string },
  ) {
    return request<{ resource: ProjectResource }>(
      `/admin/projects/${projectId}/resources/attach`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  createResource(
    projectId: string,
    body: { kind: "kv" | "d1"; name: string },
  ) {
    return request<{ resource: ProjectResource }>(
      `/admin/projects/${projectId}/resources/create`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  deleteResource(projectId: string, resourceId: string, deleteCf = false) {
    const q = deleteCf ? "?delete_cf=true" : "";
    return request<{ ok: boolean }>(
      `/admin/projects/${projectId}/resources/${resourceId}${q}`,
      { method: "DELETE" },
    );
  },
  listCfResources(kind: "kv" | "d1") {
    return request<ListCfResourcesResponse>(
      `/admin/cloudflare/resources?kind=${kind}`,
    );
  },
  listKeys(projectId: string) {
    return request<{ keys: ApiKeyPublic[] }>(
      `/admin/projects/${projectId}/keys`,
    );
  },
  createKey(projectId: string, body: { name: string; role: "anon" | "service_role" }) {
    return request<CreateApiKeyResponse>(
      `/admin/projects/${projectId}/keys`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  revokeKey(projectId: string, keyId: string) {
    return request<{ key: ApiKeyPublic }>(
      `/admin/projects/${projectId}/keys/${keyId}/revoke`,
      { method: "POST" },
    );
  },
  // Dashboard Redis / D1 browsers — admin session, no project API key
  async redisCommand(projectId: string, argv: string[]) {
    const res = await request<{ result: unknown }>(
      `/admin/projects/${projectId}/browser/redis`,
      { method: "POST", body: JSON.stringify({ argv }) },
    );
    return res.result;
  },
  redisKeys(
    projectId: string,
    opts: { prefix?: string; cursor?: string; limit?: number } = {},
  ) {
    return request<KvListResponse>(
      `/admin/projects/${projectId}/browser/redis/keys`,
      { method: "POST", body: JSON.stringify(opts) },
    );
  },
  redisInspect(projectId: string, key: string) {
    return request<RedisInspectResponse>(
      `/admin/projects/${projectId}/browser/redis/inspect`,
      { method: "POST", body: JSON.stringify({ key }) },
    );
  },
  redisSet(
    projectId: string,
    key: string,
    value: string,
    ttlSeconds?: number,
  ) {
    const argv =
      ttlSeconds != null && ttlSeconds > 0
        ? ["SET", key, value, "EX", String(ttlSeconds)]
        : ["SET", key, value];
    return this.redisCommand(projectId, argv);
  },
  redisDelete(projectId: string, keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    return this.redisCommand(projectId, ["DEL", ...list]);
  },
  redisExpire(projectId: string, key: string, ttlSeconds: number) {
    return this.redisCommand(projectId, ["EXPIRE", key, String(ttlSeconds)]);
  },
  redisPersist(projectId: string, key: string) {
    return this.redisCommand(projectId, ["PERSIST", key]);
  },
  d1Query(projectId: string, sql: string, params: unknown[] = []) {
    return request<{
      success: boolean;
      errors: unknown[];
      messages: unknown[];
      result: unknown;
    }>(`/admin/projects/${projectId}/browser/d1/query`, {
      method: "POST",
      body: JSON.stringify({ sql, params }),
    });
  },
  d1Schema(projectId: string) {
    return request<D1SchemaResponse>(
      `/admin/projects/${projectId}/browser/d1/schema`,
      { method: "POST" },
    );
  },
};
