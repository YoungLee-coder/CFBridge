import { Hono } from "hono";
import type { AppEnv } from "../lib/http";
import apiDocsMd from "../../docs/api.md";

const docs = new Hono<AppEnv>();

const MARKDOWN_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "Access-Control-Allow-Origin": "*",
} as const;

function markdownResponse(body: string) {
  return new Response(body, { status: 200, headers: MARKDOWN_HEADERS });
}

function buildLlmsTxt(origin: string): string {
  return `# CFBridge

> Single-admin multi-project gateway exposing Cloudflare KV (Upstash-style Redis REST) and D1 over stable HTTP under \`/v1/{ref}/…\`.

Fetch the full API reference as Markdown. Do not scrape the Dashboard HTML.

## Docs

- [API Reference](${origin}/docs/api.md): Data plane Redis + D1, auth, error envelopes, admin short table
- [Full API Reference](${origin}/llms-full.txt): Same body as /docs/api.md (llms-full alias)

## Optional

- [Human docs page](${origin}/docs): Rendered docs with copy-as-Markdown
- [Health](${origin}/health): Worker readiness JSON
`;
}

docs.get("/api.md", (c) => markdownResponse(apiDocsMd));

export function registerDocsRoutes(app: Hono<AppEnv>) {
  app.route("/docs", docs);

  app.get("/llms.txt", (c) => {
    const origin = new URL(c.req.url).origin;
    return markdownResponse(buildLlmsTxt(origin));
  });

  app.get("/llms-full.txt", (c) => markdownResponse(apiDocsMd));
}

export { apiDocsMd };
