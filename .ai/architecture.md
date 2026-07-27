# Architecture

## Repository Map

- `src/` — Hono Cloudflare Worker：管理 API、数据面（Redis REST → KV、D1 libSQL/Hrana + CF 信封）、健康检查；入口 `src/index.ts`。
- `src/routes/admin/` — 管理路由：认证、项目（创建时自动签发可公开/服务端密钥）、资源挂载/创建、Cloudflare 账号资源列表、API Key、Setup、设置。
- `src/routes/v1/` — 数据面路由：`redis.ts`（Upstash 兼容子集）、`d1.ts`（libSQL pipeline + CF query/raw）。
- `src/lib/` — 核心逻辑：认证、加密、Meta D1、Cloudflare Account API、共享 DATA_KV Binding、Hrana、迁移、Setup 状态。
- `migrations/` — Meta D1 schema 迁移（`wrangler d1 migrations apply`）。
- `wrangler.toml` — 生产 Worker 配置（根目录）；不写 Meta D1 的 `database_id`（面板绑 `META`）；`[assets] directory = "dist"`。
- `wrangler.dev.toml` — 本地 `wrangler dev` / `db:migrate:local` 配置；含占位 `META` 绑定。
- `web/` — Vite + React Dashboard；构建产物根目录 `dist/` 作为 Worker static assets。
- `web/src/pages/` — Setup、Login、Projects；项目子页在 `web/src/pages/project/`（Overview / Keys / KV / D1）。
- `web/src/components/layouts/` — Dashboard 壳（icon rail + header）、ProjectLayout、PageHeader。
- `web/src/i18n/` — 中英文文案（`en` / `zh-CN`，默认 `zh-CN`）。
- `shared-types/` — 跨端共享类型、`ErrorCode`、`apiError()` 辅助函数（path alias `@cfbridge/shared`）；改类型时 API 与 Web 同步更新。
- `README.md` — 架构说明、curl 验收路径、部署流程（权威参考）。
