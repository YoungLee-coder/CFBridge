import type { Env } from "../env";
import * as cf from "./cf-account";
import { CfApiError } from "./cf-account";

/** Sentinel stored in project_resources.cf_id for shared DATA_KV binding. */
export const SHARED_KV_CF_ID = "DATA_KV";

export type KvAccessMode = "binding" | "rest";

export type KvBackend =
  | { mode: "binding"; kv: KVNamespace; keyPrefix: string }
  | { mode: "rest"; env: Env; namespaceId: string };

export function projectKeyPrefix(projectRef: string): string {
  return `${projectRef}/`;
}

export function physicalKey(backend: KvBackend, userKey: string): string {
  if (backend.mode === "binding") return `${backend.keyPrefix}${userKey}`;
  return userKey;
}

export function toUserKey(backend: KvBackend, physical: string): string {
  if (backend.mode !== "binding") return physical;
  if (physical.startsWith(backend.keyPrefix)) {
    return physical.slice(backend.keyPrefix.length);
  }
  return physical;
}

export function resolveKvBackend(
  env: Env,
  opts: {
    accessMode: KvAccessMode;
    cfId: string;
    projectRef: string;
  },
): KvBackend {
  if (opts.accessMode === "binding") {
    if (!env.DATA_KV) {
      throw new Error("DATA_KV binding is missing");
    }
    return {
      mode: "binding",
      kv: env.DATA_KV,
      keyPrefix: projectKeyPrefix(opts.projectRef),
    };
  }
  return { mode: "rest", env, namespaceId: opts.cfId };
}

export async function kvBackendGet(
  backend: KvBackend,
  userKey: string,
): Promise<{ value: string | null; metadata: unknown }> {
  if (backend.mode === "binding") {
    const key = physicalKey(backend, userKey);
    const got = await backend.kv.getWithMetadata(key, "text");
    return { value: got.value, metadata: got.metadata };
  }
  return cf.kvGet(backend.env, backend.namespaceId, userKey);
}

export async function kvBackendPut(
  backend: KvBackend,
  userKey: string,
  value: string,
  options?: { expiration_ttl?: number; metadata?: unknown },
): Promise<void> {
  if (backend.mode === "binding") {
    const key = physicalKey(backend, userKey);
    await backend.kv.put(key, value, {
      expirationTtl: options?.expiration_ttl,
      metadata: options?.metadata as Record<string, unknown> | undefined,
    });
    return;
  }
  await cf.kvPut(backend.env, backend.namespaceId, userKey, value, options);
}

export async function kvBackendDelete(
  backend: KvBackend,
  userKey: string,
): Promise<boolean> {
  if (backend.mode === "binding") {
    const key = physicalKey(backend, userKey);
    const existing = await backend.kv.get(key);
    if (existing === null) return false;
    await backend.kv.delete(key);
    return true;
  }
  return cf.kvDelete(backend.env, backend.namespaceId, userKey);
}

export async function kvBackendList(
  backend: KvBackend,
  opts: { userPrefix?: string; limit?: number; cursor?: string } = {},
): Promise<{
  keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
  cursor?: string;
  list_complete: boolean;
}> {
  if (backend.mode === "binding") {
    const prefix = `${backend.keyPrefix}${opts.userPrefix ?? ""}`;
    const page = await backend.kv.list({
      prefix,
      limit: opts.limit,
      cursor: opts.cursor,
    });
    return {
      keys: page.keys.map((k) => ({
        name: toUserKey(backend, k.name),
        expiration: k.expiration,
        metadata: k.metadata,
      })),
      cursor: "cursor" in page ? page.cursor : undefined,
      list_complete: page.list_complete,
    };
  }
  return cf.kvList(backend.env, backend.namespaceId, {
    prefix: opts.userPrefix || undefined,
    limit: opts.limit,
    cursor: opts.cursor,
  });
}

/** Parallel get; uses KV bulk get when on binding and ≤100 keys. */
export async function kvBackendMget(
  backend: KvBackend,
  userKeys: string[],
): Promise<Array<string | null>> {
  if (backend.mode === "binding" && userKeys.length > 0 && userKeys.length <= 100) {
    const physical = userKeys.map((k) => physicalKey(backend, k));
    const map = await backend.kv.get(physical);
    return physical.map((pk) => {
      const v = map.get(pk);
      return v === undefined || v === null ? null : String(v);
    });
  }

  return Promise.all(
    userKeys.map(async (k) => {
      const { value } = await kvBackendGet(backend, k);
      return value;
    }),
  );
}

export async function kvBackendMset(
  backend: KvBackend,
  pairs: Array<[string, string]>,
): Promise<void> {
  await Promise.all(pairs.map(([k, v]) => kvBackendPut(backend, k, v)));
}

export async function kvBackendMdel(
  backend: KvBackend,
  userKeys: string[],
): Promise<number> {
  const results = await Promise.all(
    userKeys.map((k) => kvBackendDelete(backend, k)),
  );
  return results.filter(Boolean).length;
}

export async function kvBackendMexists(
  backend: KvBackend,
  userKeys: string[],
): Promise<number> {
  const values = await kvBackendMget(backend, userKeys);
  return values.filter((v) => v !== null).length;
}

export function isKvBackendError(e: unknown): e is Error {
  return e instanceof Error || e instanceof CfApiError;
}

export function kvBackendErrorMessage(e: unknown): string {
  if (e instanceof CfApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "internal error";
}

/** Delete all keys under a binding project's prefix (isolation cleanup). */
export async function purgeBindingPrefix(
  env: Env,
  projectRef: string,
): Promise<number> {
  if (!env.DATA_KV) return 0;
  const backend: KvBackend = {
    mode: "binding",
    kv: env.DATA_KV,
    keyPrefix: projectKeyPrefix(projectRef),
  };
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await backend.kv.list({
      prefix: backend.keyPrefix,
      limit: 1000,
      cursor,
    });
    await Promise.all(page.keys.map((k) => backend.kv.delete(k.name)));
    deleted += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}
