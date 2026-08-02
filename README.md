# CFBridge

单管理员、多项目的 Cloudflare 网关：把 **KV**（Upstash 风格 Redis REST）和 **D1** 以稳定 HTTP API 暴露出去，任意云上的应用都能用边缘存储，不必自己跑在 Workers 上。

管理端、数据面与 Dashboard 部署在同一个 Worker（`cfbridge`）里：`/admin`、`/v1`、`/health` 进 Hono，其余走 SPA。

更细的 API 说明见 [docs/api.md](docs/api.md)。

---

## 部署

### 1. 部署 Worker

任选其一：

**A. Cloudflare 面板（Git / Workers Builds）**


| 设置             | 值                     |
| -------------- | --------------------- |
| Build command  | `pnpm run build`      |
| Deploy command | `npx wrangler deploy` |


**B. 本地上传**

```bash
pnpm deploy
```



### 2. 配置 Secrets

Workers & Pages → **cfbridge** → Settings → Variables and Secrets：


| Secret                  | 用途                                            |
| ----------------------- | --------------------------------------------- |
| `ADMIN_PASSWORD`        | Dashboard / 管理 API 密码                         |
| `SESSION_SECRET`        | 管理会话签名（长随机串）                                  |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID                              |
| `CLOUDFLARE_API_TOKEN`  | 需具备 **Workers KV Storage Edit** 与 **D1 Edit** |




### 3. 绑定 Meta D1 与 DATA_KV

1. Cloudflare → **D1** → Create database → 名称 `cfbridge-meta`（也可稍后在 Setup 页一键创建）
2. Workers & Pages → **cfbridge** → Settings → Bindings → Add → **D1 database**
3. Variable name 必须是 `META`，选择上面的数据库 → Save
4. 同页再 Add → **KV namespace**，Variable name 必须是 `DATA_KV`，选择或创建 `cfbridge-data` → Save

绑定立即生效，不必为绑资源再部署一次。没有 `DATA_KV` 时无法「创建」快路径 KV，仍可挂载已有 namespace。

### 4. Setup 初始化

打开 Worker URL。若 Meta 未绑定或 schema 未初始化，会进入 **Setup** 界面：

1. （可选）一键创建 Meta D1，再按提示在面板绑定 `META`
2. 确认已绑定 `DATA_KV`
3. 点 **重新检测**，确认已绑定
4. 点击 **一键初始化 / 升级数据库**

上线后只有一个 URL（例如 `https://cfbridge.<subdomain>.workers.dev`）：


| 路径         | 内容                |
| ---------- | ----------------- |
| `/`        | Setup 或 Dashboard |
| `/admin/*` | 管理 / Setup API    |
| `/v1/*`    | 数据 API            |
| `/health`  | 健康检查              |


可选：在 Cloudflare Dashboard 给该 Worker 绑自定义域名。

---



## 本地开发



### 1. 安装

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

编辑根目录 `.dev.vars`：


| 变量                      | 用途                                            |
| ----------------------- | --------------------------------------------- |
| `ADMIN_PASSWORD`        | Dashboard / 管理 API 密码                         |
| `SESSION_SECRET`        | 用于签署管理会话的长随机串                                 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID                              |
| `CLOUDFLARE_API_TOKEN`  | 需具备 **Workers KV Storage Edit** 与 **D1 Edit** |


本地开发用 `wrangler.dev.toml`（含占位 `META` + `DATA_KV`）；生产部署用 `wrangler.toml`。

### 2. 本地 Meta D1 迁移

```bash
pnpm db:migrate:local
```



### 3. 启动

```bash
pnpm dev    # wrangler :8787 + vite :5173（并行）
```

打开 http://127.0.0.1:8787（或 Vite :5173），用 `ADMIN_PASSWORD` 登录。

也可以拆开跑（Vite HMR + API 分开）：

```bash
pnpm build     # 先产出根目录 dist/（Worker assets 需要）
pnpm dev:api   # 仅 Worker（需已有 dist/）
pnpm dev:web   # Vite 在 :5173，把 /admin 和 /v1 代理到 :8787
```



### 常用命令

```bash
pnpm typecheck              # Worker + web 类型检查
pnpm build                  # 构建 Dashboard → ./dist
pnpm db:migrate:remote      # 远程 Meta D1 迁移
pnpm deploy                 # build + wrangler deploy
```

