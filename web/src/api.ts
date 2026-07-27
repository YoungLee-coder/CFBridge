import type {
  ApiErrorBody,
  ApiKeyPublic,
  CreateApiKeyResponse,
  CreateMetaDbResponse,
  InstanceSettings,
  Locale,
  MigrateResponse,
  Project,
  ProjectResource,
  SetupStatus,
} from "@cfbridge/shared";

const TOKEN_KEY = "cfbridge_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

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
  setupStatus(createdDatabaseId?: string) {
    const q = createdDatabaseId
      ? `?created_database_id=${encodeURIComponent(createdDatabaseId)}`
      : "";
    return request<SetupStatus>(`/admin/setup/status${q}`, {}, false);
  },
  createMetaDb() {
    return request<CreateMetaDbResponse>("/admin/setup/create-meta-db", {
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
    return request<InstanceSettings>("/admin/settings", {}, false);
  },
  updateLocale(locale: Locale) {
    return request<InstanceSettings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ locale }),
    });
  },
  login(password: string) {
    return request<{ token: string; role: string }>(
      "/admin/auth/login",
      { method: "POST", body: JSON.stringify({ password }) },
      false,
    );
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
    return request<{ project: Project }>("/admin/projects", {
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
  // Data plane helpers for dashboard browsers (Redis REST over KV)
  async redisCommand(ref: string, apiKey: string, argv: string[]) {
    const path = argv.map((p) => encodeURIComponent(p)).join("/");
    const res = await fetch(`/v1/${ref}/redis/${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = (await res.json()) as {
      result?: unknown;
      error?: string | { code?: string; message?: string };
    };
    const errMsg =
      typeof json.error === "string"
        ? json.error
        : json.error?.message || "Redis command failed";
    if (!res.ok || typeof json.error === "string") {
      throw new ApiClientError(
        res.status,
        typeof json.error === "object" ? json.error?.code || "unknown" : "redis_error",
        errMsg,
      );
    }
    return json.result;
  },
  redisList(ref: string, apiKey: string, prefix = "") {
    const pattern = prefix ? `${prefix}*` : "*";
    return this.redisCommand(ref, apiKey, ["KEYS", pattern]).then(
      (result) =>
        ({
          keys: (Array.isArray(result) ? result : []).map((name) => ({
            name: String(name),
          })),
          list_complete: true,
        }) as {
          keys: Array<{ name: string }>;
          cursor?: string;
          list_complete: boolean;
        },
    );
  },
  redisGet(ref: string, apiKey: string, key: string) {
    return this.redisCommand(ref, apiKey, ["GET", key]).then((value) => ({
      key,
      value: value == null ? "" : String(value),
      metadata: null as unknown,
    }));
  },
  redisSet(ref: string, apiKey: string, key: string, value: string) {
    return this.redisCommand(ref, apiKey, ["SET", key, value]);
  },
  redisDelete(ref: string, apiKey: string, key: string) {
    return this.redisCommand(ref, apiKey, ["DEL", key]);
  },
  d1Query(ref: string, apiKey: string, sql: string, params: unknown[] = []) {
    return fetch(`/v1/${ref}/d1/cf/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }).then(async (res) => {
      const json = (await res.json()) as {
        success?: boolean;
        result?: unknown;
        errors?: Array<{ code?: number; message?: string }>;
        error?: { code?: string; message?: string };
      };
      if (!res.ok || json.success === false) {
        throw new ApiClientError(
          res.status,
          json.error?.code ||
            (json.errors?.[0]?.code != null
              ? String(json.errors[0].code)
              : "unknown"),
          json.errors?.[0]?.message ||
            json.error?.message ||
            "D1 query failed",
        );
      }
      return json as {
        success: true;
        errors: unknown[];
        messages: unknown[];
        result: unknown;
      };
    });
  },
};
