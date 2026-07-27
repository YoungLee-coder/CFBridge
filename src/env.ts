export interface Env {
  META?: D1Database;
  /** Shared KV for project Redis data plane (key prefix = `{ref}/`). */
  DATA_KV?: KVNamespace;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
}
