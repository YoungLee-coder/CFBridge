# CFBridge API Reference

> Single-admin multi-project gateway: expose Cloudflare KV (Upstash-style Redis REST) and D1 over stable HTTP. Data plane lives under `/v1/{ref}/…`; management under `/admin/…`. Dashboard SPA shares the same Worker origin.

Replace `{origin}` with your Worker URL (e.g. `https://cfbridge.example.com`) and `{ref}` with the project ref.

## Authentication

### Data plane (`/v1`)

- Header: `Authorization: Bearer <project_api_key>`
- Roles: `anon` (publishable) | `service_role` (secret)
- New projects auto-mint one of each; plaintext is returned only on create
- If the project has `anon_readonly` enabled (default for new projects), `anon` keys cannot write

### Admin (`/admin`)

- Header: `Authorization: Bearer <session_token>` from `POST /admin/auth/login` (for curl / scripts)
- Or HttpOnly session cookie set by login (Dashboard uses cookie only; `credentials: include`)

### Health

- `GET /health` — no auth; returns `{ ok: true }` only. Setup/migration details live under `/admin/setup/status`.

## Error envelopes

**Admin** (and most non-Redis JSON errors):

```json
{ "error": { "code": "unauthorized", "message": "…" } }
```

**Redis** (Upstash-compatible):

```json
{ "result": … }
```

```json
{ "error": "ERR …" }
```

**D1 libSQL / Hrana:** statement errors appear as `results[].type === "error"` with HTTP 200. Auth failures remain HTTP 4xx.

## Data plane — Redis REST (`/v1/{ref}/redis`)

Upstash Redis REST–compatible subset. Storage backend is the project’s Cloudflare KV namespace.

| Method | Path | Description |
| --- | --- | --- |
| GET/POST | `/v1/{ref}/redis/{cmd}/…args` | Path-style command, e.g. `/set/k/v`, `/get/k` |
| POST | `/v1/{ref}/redis` | Body: `["SET","k","v"]` |
| POST | `/v1/{ref}/redis/pipeline` | Body: `[["SET","k","v"],["GET","k"]]` |

### Supported commands

`PING`, `GET`, `SET` (option `EX` only), `SETEX`, `DEL`, `EXISTS`, `MGET`, `MSET`, `EXPIRE`, `PERSIST`, `TTL`, `KEYS` (`*` or `prefix*` only), `SCAN`.

### Not supported

Hash / List / Set / ZSet, `INCR*`, `SET NX|XX|PX`, `/multi-exec`, Pub/Sub.

### TTL

`EX`, `SETEX`, and `EXPIRE` require TTL **≥ 60 seconds** (Cloudflare KV limit).

### SDK example (`@upstash/redis`)

```ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "{origin}/v1/{ref}/redis",
  token: "cfb_sk_…",
});

await redis.set("user:100", "Lee");
console.log(await redis.get("user:100"));
```

### curl

```bash
curl -s "{origin}/v1/{ref}/redis/set/hello/world" \
  -H "Authorization: Bearer $API_KEY"

curl -s -X POST "{origin}/v1/{ref}/redis" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '["SET","hello","world","EX",3600]'
```

## Data plane — D1 Cloudflare envelope (`/v1/{ref}/d1/cf`)

Request/response shape matches the [Cloudflare D1 Account API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) `/query` and `/raw`. The database is selected by `{ref}` in the URL (no `account_id` / `database_id` in the body). Auth: project API key.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/v1/{ref}/d1/cf/query` | Rows as objects (CF `/query`) |
| POST | `/v1/{ref}/d1/cf/raw` | Rows as arrays (CF `/raw`) |

Body (either form):

```json
{ "sql": "SELECT * FROM notes WHERE id = ?", "params": [1] }
```

```json
{
  "batch": [
    { "sql": "INSERT INTO notes (body) VALUES (?)", "params": ["a"] },
    { "sql": "SELECT * FROM notes" }
  ]
}
```

Success shape:

```json
{
  "success": true,
  "errors": [],
  "messages": [],
  "result": [
    { "results": [], "success": true, "meta": {} }
  ]
}
```

```bash
curl -s -X POST "{origin}/v1/{ref}/d1/cf/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT * FROM notes"}'
```

## Data plane — D1 libSQL / Hrana (`/v1/{ref}/d1`)

Compatible with `@libsql/client` (and Drizzle / Kysely on top). Point the client URL at the data plane.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/v1/{ref}/d1/v2` · `/v3` | Protocol probe (no auth) |
| POST | `/v1/{ref}/d1/v2/pipeline` · `/v3/pipeline` | Hrana pipeline (Bearer API key) |

Supported request types: `execute`, `batch` (with `ok` / `error` / `not` / `and` / `or` / `is_autocommit`), `sequence`, `store_sql` / `close_sql`, `describe` (stub), `close`, `get_autocommit`.

**Not supported:** interactive multi-request sessions (`baton` is always `null`). Put atomic work in one `batch` / pipeline, or use explicit `BEGIN` / `COMMIT` in SQL.

Underlying storage uses Cloudflare D1 `/raw` (array rows; duplicate column names are preserved).

### SDK example (`@libsql/client`)

```ts
import { createClient } from "@libsql/client/web";

const client = createClient({
  url: "{origin}/v1/{ref}/d1",
  authToken: "cfb_sk_…",
});

await client.execute(
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT)",
);
await client.execute({
  sql: "INSERT INTO notes (body) VALUES (?)",
  args: ["hello from libsql"],
});
const rs = await client.execute("SELECT * FROM notes");
console.log(rs.rows);

await client.batch([
  "INSERT INTO notes (body) VALUES ('a')",
  "INSERT INTO notes (body) VALUES ('b')",
]);
```

## Admin API (short)

Bearer session token or cookie. Full operational setup is documented in the repository README, not here.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/admin/auth/login` | `{ password }` → `{ token }` |
| GET | `/admin/auth/me` | Session check |
| GET/POST | `/admin/projects` | List / create |
| GET/PATCH/DELETE | `/admin/projects/:id` | Get / update / delete (`?delete_cf=true` deletes CF resources) |
| POST | `/admin/projects/:id/resources/create` | Create KV or D1 via CF API |
| POST | `/admin/projects/:id/resources/attach` | Attach existing CF id |
| GET/POST | `/admin/projects/:id/keys` | List / mint API key (plaintext shown once) |
| POST | `/admin/projects/:id/keys/:keyId/revoke` | Revoke key |
| POST | `/admin/projects/:id/browser/redis` | Dashboard Redis argv proxy `{ argv }` → `{ result }` (service_role) |
| POST | `/admin/projects/:id/browser/redis/keys` | Paginated key list `{ prefix?, cursor?, limit? }` → `KvListResponse` |
| POST | `/admin/projects/:id/browser/redis/inspect` | Key inspect `{ key }` → value, metadata, TTL |
| POST | `/admin/projects/:id/browser/d1/query` | Dashboard D1 SQL `{ sql, params? }` → CF query envelope |
| POST | `/admin/projects/:id/browser/d1/schema` | Tables/views + `PRAGMA table_info` → `D1SchemaResponse` |

Dashboard Redis/D1 browsers use the admin session only (not project API keys). TTL/`EX`/`SETEX`/`EXPIRE` still require ≥ 60 seconds (Cloudflare KV).

## AI / machine-readable docs

| URL | Content |
| --- | --- |
| `/docs/api.md` | This document (`text/markdown`) |
| `/llms.txt` | Curated index ([llms.txt](https://llmstxt.org/) format) |
| `/llms-full.txt` | Full API reference (same body as `/docs/api.md`) |
| `/docs` | Human-readable page (copy Markdown button) |
