# CFBridge

单管理员、多项目的网关：把 Cloudflare **KV**（经 Upstash 风格 **Redis REST**）和 **D1** 以稳定 HTTP API 暴露出去，让任意云上的应用都能用边缘存储，而不必跑在 Workers 上。

## 架构

- **管理 API**：密码登录、项目管理、挂载/创建 KV 与 D1、签发 API Key
- **数据 API**：`/v1/{ref}/redis/*`（Redis REST → KV）与 `/v1/{ref}/d1/*`（libSQL/Hrana、Cloudflare 官方信封），用项目 API Key 鉴权
- **Meta D1**：存项目、资源映射、以及哈希后的 Key
- **Dashboard**：Vite React 控制台，打包为 Worker Static Assets，与 API 同源

数据读写走 Cloudflare Account REST API，用你的账号 token（可动态加项目，不必改 binding 再部署）。

**一个 Worker：** API 与 Dashboard 一起部署为 `cfbridge`。`/admin` 和 `/v1` 进 Hono，其余走 SPA。

## 快速开始

### 1. 安装

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

编辑根目录 `.dev.vars`：

| 变量 | 用途 |
|---|---|
| `ADMIN_PASSWORD` | Dashboard / 管理 API 密码 |
| `SESSION_SECRET` | 用于签署管理会话的长随机串 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| `CLOUDFLARE_API_TOKEN` | 需具备 **Workers KV Storage Edit** 与 **D1 Edit** |

### 2. 本地 Meta D1（仅本地开发）

编辑根目录 `wrangler.toml`，取消注释底部的 `[[d1_databases]]` 本地占位块，然后：

```bash
pnpm db:migrate:local
```

生产环境请**不要**在 toml 里写 `database_id`，改在 Cloudflare 面板绑定（见下方「部署」）。

### 3. 启动（单个 Worker：API + Dashboard）

```bash
pnpm dev    # wrangler :8787 + vite :5173（并行）
```

打开 http://127.0.0.1:8787（或 Vite :5173），用 `ADMIN_PASSWORD` 登录。

可选拆开开发（Vite HMR + API 分开跑）：

```bash
pnpm build     # 先产出根目录 dist/（Worker assets 需要）
pnpm dev:api   # 仅 Worker（需已有 dist/）
pnpm dev:web   # Vite 在 :5173，把 /admin 和 /v1 代理到 :8787
```

## Curl 验收路径

```bash
API=http://127.0.0.1:8787

# 管理端登录
TOKEN=$(curl -s "$API/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"password":"change-me"}' | jq -r .token)

# 创建项目
PROJECT=$(curl -s "$API/admin/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo","ref":"demo"}')
echo "$PROJECT" | jq
PROJECT_ID=$(echo "$PROJECT" | jq -r .project.id)
REF=$(echo "$PROJECT" | jq -r .project.ref)

# 挂载已有 KV + D1（也可用 /resources/create 新建）
curl -s "$API/admin/projects/$PROJECT_ID/resources/attach" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"kv","cf_id":"YOUR_KV_NAMESPACE_ID","name":"demo-kv"}' | jq

curl -s "$API/admin/projects/$PROJECT_ID/resources/attach" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"d1","cf_id":"YOUR_D1_DATABASE_UUID","name":"demo-d1"}' | jq

# 签发 service_role Key（明文只显示一次）
KEY_RES=$(curl -s "$API/admin/projects/$PROJECT_ID/keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"server","role":"service_role"}')
API_KEY=$(echo "$KEY_RES" | jq -r .key)
echo "$API_KEY"

# 数据面 — Redis REST（背后是 Cloudflare KV）
curl -s "$API/v1/$REF/redis/set/hello/world" \
  -H "Authorization: Bearer $API_KEY" | jq

curl -s "$API/v1/$REF/redis/get/hello" \
  -H "Authorization: Bearer $API_KEY" | jq

curl -s "$API/v1/$REF/redis/keys/*" \
  -H "Authorization: Bearer $API_KEY" | jq

# 或 POST 整条命令
curl -s -X POST "$API/v1/$REF/redis" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '["SET","hello","world","EX",3600]' | jq

# 数据面 — D1（libSQL / Hrana）
curl -s -X POST "$API/v1/$REF/d1/v2/pipeline" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "baton": null,
    "requests": [
      { "type": "execute", "stmt": { "sql": "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT)" } },
      { "type": "execute", "stmt": { "sql": "INSERT INTO notes (body) VALUES (?)", "args": [{ "type": "text", "value": "hello from cfbridge" }] } },
      { "type": "execute", "stmt": { "sql": "SELECT * FROM notes" } },
      { "type": "close" }
    ]
  }' | jq

# 数据面 — D1（Cloudflare 官方信封）
curl -s -X POST "$API/v1/$REF/d1/cf/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT * FROM notes"}' | jq
```

若要新建资源而不是挂载：

```bash
curl -s "$API/admin/projects/$PROJECT_ID/resources/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"kv","name":"cfbridge-demo-kv"}' | jq
```

## API 摘要

### 管理端（Bearer 管理会话 token 或 cookie）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/auth/login` | `{ password }` → `{ token }` |
| GET | `/admin/auth/me` | 检查会话 |
| GET/POST | `/admin/projects` | 列表 / 创建 |
| GET/PATCH/DELETE | `/admin/projects/:id` | 获取 / 更新 / 删除（`?delete_cf=true`） |
| POST | `/admin/projects/:id/resources/create` | 经 CF API 创建 KV 或 D1 |
| POST | `/admin/projects/:id/resources/attach` | 挂载已有 CF id |
| GET/POST | `/admin/projects/:id/keys` | 列表 / 签发 Key |
| POST | `/admin/projects/:id/keys/:keyId/revoke` | 吊销 |

### 数据端（Bearer 项目 API Key，或 Redis 的 `?_token=`）

#### Redis REST（Upstash 兼容子集，存储为项目 KV）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/v1/:ref/redis/:cmd/...args` | 如 `/set/k/v`、`/get/k`、`/del/k` |
| POST | `/v1/:ref/redis` | body `["SET","k","v"]` |
| POST | `/v1/:ref/redis/pipeline` | body `[["SET","k","v"],["GET","k"]]` |

成功：`{ "result": … }`；失败：`{ "error": "ERR …" }`（与管理端错误信封不同，以兼容 `@upstash/redis`）。

支持：`PING`、`GET`、`SET`（仅 `EX`）、`SETEX`、`DEL`、`EXISTS`、`MGET`、`MSET`、`EXPIRE`、`KEYS`（`*` / `prefix*`）、`SCAN`。  
不支持：Hash/List/Set/ZSet、`INCR*`、`SET NX/XX/PX`、`/multi-exec`、Pub/Sub。  
TTL：`EX` / `SETEX` / `EXPIRE` 须 **≥ 60 秒**（Cloudflare KV 限制）。

```ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "https://your-worker.example.com/v1/demo/redis",
  token: "cfb_sk_…",
});

await redis.set("user:100", "Lee");
console.log(await redis.get("user:100"));
```

#### D1 — Cloudflare 官方 REST 信封

与 [Cloudflare D1 Account API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) 的 `/query`、`/raw` 请求/响应同形。库由 URL 里的 `:ref` 决定（不必传 `account_id` / `database_id`），鉴权用项目 API Key。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/:ref/d1/cf/query` | 行结果为对象数组（同 CF `/query`） |
| POST | `/v1/:ref/d1/cf/raw` | 行结果为数组（同 CF `/raw`） |

Body（二选一，与官方一致）：

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

成功响应：

```json
{
  "success": true,
  "errors": [],
  "messages": [],
  "result": [
    { "results": […], "success": true, "meta": { … } }
  ]
}
```

```bash
curl -s -X POST "$API/v1/$REF/d1/cf/query" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT * FROM notes"}' | jq
```

#### D1 — libSQL / Hrana over HTTP（推荐 ORM）

与 `@libsql/client`（及挂在其上的 Drizzle / Kysely）兼容。把项目 D1 的 URL 指到数据面即可：

```ts
import { createClient } from "@libsql/client/web";
// 或 Node: import { createClient } from "@libsql/client";

const client = createClient({
  url: "https://your-worker.example.com/v1/demo/d1",
  authToken: "cfb_sk_…",
});

await client.execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT)");
await client.execute({
  sql: "INSERT INTO notes (body) VALUES (?)",
  args: ["hello from libsql"],
});
const rs = await client.execute("SELECT * FROM notes");
console.log(rs.rows);

// 多语句（单次 pipeline，非交互式事务）
await client.batch([
  "INSERT INTO notes (body) VALUES ('a')",
  "INSERT INTO notes (body) VALUES ('b')",
]);
```

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/:ref/d1/v2` · `/v3` | 协议版本探测（无需鉴权） |
| POST | `/v1/:ref/d1/v2/pipeline` · `/v3/pipeline` | Hrana pipeline（Bearer API Key） |

支持：`execute`、`batch`（含 `ok`/`error`/`not`/`and`/`or`/`is_autocommit` 条件）、`sequence`、`store_sql`/`close_sql`、`describe`（桩）、`close`、`get_autocommit`。  
**不支持**：跨请求的交互式会话（`baton` 恒为 `null`）——请把需要原子性的语句放进同一次 `batch` / pipeline，或在 SQL 里显式 `BEGIN`/`COMMIT`。

底层走 Cloudflare D1 **`/raw`**（行是数组，重复列名不会丢）。

角色：`anon` | `service_role`。若项目开启 `anon_readonly`，anon Key 不能写。

管理端错误格式：

```json
{ "error": { "code": "unauthorized", "message": "…" } }
```

libSQL pipeline 内的语句错误落在 `results[].type === "error"`（HTTP 仍为 200，符合 Hrana）；鉴权失败仍是 HTTP 4xx。
## 部署（单个 Worker · 推荐面板绑库）

整体打成一个名为 `cfbridge` 的 Worker：Hono API + 构建好的 Dashboard 静态资源。  
`wrangler.toml` **故意不写** Meta D1 的 `database_id`，避免覆盖你在面板里的绑定。

### 1. 部署 Worker

任选其一：

**A. Cloudflare 面板（Git / Workers Builds）**  
连接本仓库。推荐配置：

| 设置 | 值 |
|------|-----|
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |

确保部署用的 `wrangler.toml` 里没有生产用的 `[[d1_databases]]`。

**B. 本地 wrangler 上传代码（仍可在面板绑库）**

```bash
pnpm deploy
```

### 2. 在面板配置 Secrets

Workers & Pages → **cfbridge** → Settings → Variables and Secrets，添加：

| Secret | 用途 |
|---|---|
| `ADMIN_PASSWORD` | Dashboard / 管理 API 密码 |
| `SESSION_SECRET` | 管理会话签名 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| `CLOUDFLARE_API_TOKEN` | 需具备 **Workers KV Storage Edit** 与 **D1 Edit** |

### 3. 在面板绑定 Meta D1

1. Cloudflare → **D1** → Create database → 名称 `cfbridge-meta`（也可稍后在 Setup 页一键创建）
2. Workers & Pages → **cfbridge** → **Settings** → **Bindings** → Add → **D1 database**
3. Variable name 必须是 **`META`**，选择上面的数据库 → Save  
   （绑定立即生效，**不必**为绑库再部署一次）

### 4. Setup 初始化

打开 Worker URL。若 Meta 未绑定或 schema 未初始化，会进入 **Setup** 界面：

1. （可选）一键创建 Meta D1，再按提示在面板绑定 `META`
2. 点 **重新检测**，确认已绑定
3. 点击 **一键初始化 / 升级数据库**

上线后只有一个 URL，例如 `https://cfbridge.<subdomain>.workers.dev`：

| 路径 | 内容 |
|------|------|
| `/` | Setup 或 Dashboard |
| `/admin/*` | 管理 / Setup API |
| `/v1/*` | 数据 API |
| `/health` | 健康检查（含 `ready`） |

可选：在 Cloudflare Dashboard 给该 Worker 绑自定义域名。

## 仓库结构

```
src/             Hono Worker（管理端 + 数据面，并托管 Dashboard 静态资源）
web/             Dashboard 源码（构建到根目录 dist/，作为 Worker assets 上传）
shared-types/    共享类型 / 错误辅助（@cfbridge/shared）
migrations/      Meta D1 schema 迁移
wrangler.toml    Worker 配置（根目录）
```

## v1 不做

R2、计费、多用户注册、Workers for Platforms、实时能力。
