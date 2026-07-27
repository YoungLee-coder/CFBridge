import type { Env } from "../env";

const CF_API = "https://api.cloudflare.com/client/v4";

export class CfApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "CfApiError";
  }
}

/** Fail before calling Cloudflare so missing secrets never become `/accounts/undefined/...`. */
function requireCfCredentials(env: Env): {
  accountId: string;
  apiToken: string;
} {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (
    !accountId ||
    accountId === "your_account_id" ||
    !apiToken ||
    apiToken === "your_api_token"
  ) {
    throw new CfApiError(
      "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured. Set them in .dev.vars (local) or Worker secrets (deployed), then restart the Worker.",
      503,
    );
  }
  return { accountId, apiToken };
}

function accountUrl(env: Env, path: string): string {
  const { accountId } = requireCfCredentials(env);
  return `${CF_API}/accounts/${accountId}${path}`;
}

async function cfFetch<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { apiToken } = requireCfCredentials(env);
  const url = accountUrl(env, path);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });
  const json = (await res.json()) as {
    success: boolean;
    errors?: Array<{ message?: string; code?: number }>;
    result?: T;
    result_info?: unknown;
  };

  if (!res.ok || !json.success) {
    const msg =
      json.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `Cloudflare API error (${res.status})`;
    throw new CfApiError(msg, res.status, json);
  }

  return json.result as T;
}

async function cfFetchPaged<T>(env: Env, path: string): Promise<T[]> {
  const { apiToken } = requireCfCredentials(env);
  const all: T[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 50;

  while (page <= maxPages) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${accountUrl(env, path)}${sep}page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const json = (await res.json()) as {
      success: boolean;
      errors?: Array<{ message?: string; code?: number }>;
      result?: T[];
      result_info?: {
        page?: number;
        per_page?: number;
        count?: number;
        total_count?: number;
      };
    };

    if (!res.ok || !json.success) {
      const msg =
        json.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
        `Cloudflare API error (${res.status})`;
      throw new CfApiError(msg, res.status, json);
    }

    const batch = json.result ?? [];
    all.push(...batch);

    const totalCount = json.result_info?.total_count;
    if (totalCount != null) {
      if (all.length >= totalCount) break;
    } else if (batch.length < perPage) {
      break;
    }

    page += 1;
    if (page > maxPages && (totalCount == null || all.length < totalCount)) {
      throw new CfApiError(
        `Cloudflare list truncated after ${maxPages} pages (${all.length} items)`,
        502,
        json,
      );
    }
  }

  return all;
}

export async function createKvNamespace(
  env: Env,
  title: string,
): Promise<{ id: string; title: string }> {
  return cfFetch(env, "/storage/kv/namespaces", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function listKvNamespaces(
  env: Env,
): Promise<Array<{ id: string; title: string }>> {
  return cfFetchPaged(env, "/storage/kv/namespaces");
}

export async function createD1Database(
  env: Env,
  name: string,
): Promise<{ uuid: string; name: string }> {
  return cfFetch(env, "/d1/database", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listD1Databases(
  env: Env,
): Promise<Array<{ uuid: string; name: string }>> {
  return cfFetchPaged(env, "/d1/database");
}

export async function deleteKvNamespace(env: Env, namespaceId: string) {
  await cfFetch(env, `/storage/kv/namespaces/${namespaceId}`, {
    method: "DELETE",
  });
}

export async function deleteD1Database(env: Env, databaseId: string) {
  await cfFetch(env, `/d1/database/${databaseId}`, { method: "DELETE" });
}

export async function kvGet(
  env: Env,
  namespaceId: string,
  key: string,
): Promise<{ value: string | null; metadata: unknown }> {
  const { apiToken } = requireCfCredentials(env);
  const url = accountUrl(
    env,
    `/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (res.status === 404) {
    return { value: null, metadata: null };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new CfApiError(text || `KV get failed (${res.status})`, res.status);
  }
  const metadataHeader = res.headers.get("cf-kv-metadata");
  let metadata: unknown = null;
  if (metadataHeader) {
    try {
      metadata = JSON.parse(metadataHeader);
    } catch {
      metadata = metadataHeader;
    }
  }
  return { value: await res.text(), metadata };
}

export async function kvPut(
  env: Env,
  namespaceId: string,
  key: string,
  value: string,
  options?: { expiration_ttl?: number; metadata?: unknown },
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.expiration_ttl != null) {
    params.set("expiration_ttl", String(options.expiration_ttl));
  }
  const qs = params.toString();
  const path = `/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
  const { apiToken } = requireCfCredentials(env);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
  };
  let body: BodyInit = value;
  if (options?.metadata !== undefined) {
    const form = new FormData();
    form.set("value", value);
    form.set("metadata", JSON.stringify(options.metadata));
    body = form;
  } else {
    headers["Content-Type"] = "text/plain";
  }

  const url = accountUrl(env, path);
  const res = await fetch(url, { method: "PUT", headers, body });
  const json = (await res.json()) as {
    success: boolean;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !json.success) {
    throw new CfApiError(
      json.errors?.map((e) => e.message).join("; ") ||
        `KV put failed (${res.status})`,
      res.status,
      json,
    );
  }
}

export async function kvDelete(
  env: Env,
  namespaceId: string,
  key: string,
): Promise<boolean> {
  try {
    await cfFetch(env, `/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    return true;
  } catch (e) {
    if (e instanceof CfApiError && e.status === 404) return false;
    throw e;
  }
}

export async function kvList(
  env: Env,
  namespaceId: string,
  opts: { prefix?: string; limit?: number; cursor?: string } = {},
): Promise<{
  keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
  cursor?: string;
  list_complete: boolean;
}> {
  const params = new URLSearchParams();
  if (opts.prefix) params.set("prefix", opts.prefix);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);

  const { apiToken } = requireCfCredentials(env);
  const url = accountUrl(
    env,
    `/storage/kv/namespaces/${namespaceId}/keys?${params}`,
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const json = (await res.json()) as {
    success: boolean;
    errors?: Array<{ message?: string }>;
    result?: Array<{ name: string; expiration?: number; metadata?: unknown }>;
    result_info?: { cursor?: string; count?: number };
  };
  if (!res.ok || !json.success) {
    throw new CfApiError(
      json.errors?.map((e) => e.message).join("; ") ||
        `KV list failed (${res.status})`,
      res.status,
      json,
    );
  }
  const keys = json.result ?? [];
  const cursor = json.result_info?.cursor;
  return {
    keys,
    cursor,
    list_complete: !cursor,
  };
}

export interface D1QueryResult {
  results?: unknown[];
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

export interface D1RawResult {
  results?: {
    columns?: string[];
    rows?: unknown[][];
  };
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    duration?: number;
    rows_read?: number;
    rows_written?: number;
    changed_db?: boolean;
    [key: string]: unknown;
  };
  error?: string;
}

/** Array-shaped rows — preferred for Hrana/libSQL mapping (preserves duplicate columns). */
export async function d1Raw(
  env: Env,
  databaseId: string,
  sql: string,
  params: unknown[] = [],
): Promise<D1RawResult[]> {
  return cfFetch(env, `/d1/database/${databaseId}/raw`, {
    method: "POST",
    body: JSON.stringify({ sql, params }),
  });
}

/** Pass-through Cloudflare D1 `/query` body (`{sql,params}` or `{batch:[…]}`). */
export async function d1QueryOfficial(
  env: Env,
  databaseId: string,
  body: unknown,
): Promise<D1QueryResult[]> {
  return cfFetch(env, `/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Pass-through Cloudflare D1 `/raw` body (`{sql,params}` or `{batch:[…]}`). */
export async function d1RawOfficial(
  env: Env,
  databaseId: string,
  body: unknown,
): Promise<D1RawResult[]> {
  return cfFetch(env, `/d1/database/${databaseId}/raw`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
