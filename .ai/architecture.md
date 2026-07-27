# Architecture

## Repository Map

- `apps/api/` — Hono Cloudflare Worker：管理 API、数据面（Redis REST → KV、D1 libSQL/Hrana + CF 信封）、健康检查；入口 `src/index.ts`。
- `apps/api/src/routes/admin/` — 管理路由：认证、项目、资源挂载/创建、API Key、Setup、设置。
- `apps/api/src/routes/v1/` — 数据面路由：`redis.ts`（Upstash 兼容子集）、`d1.ts`（libSQL pipeline + CF query/raw）。
- `apps/api/src/lib/` — 核心逻辑：认证、加密、Meta D1、Cloudflare Account API、Hrana、迁移、Setup 状态。
- `apps/api/migrations/` — Meta D1 schema 迁移（`wrangler d1 migrations apply`）。
- `apps/api/wrangler.toml` — Worker 配置；生产环境不在此文件写 `database_id`（面板绑 `META`）。
- `apps/web/` — Vite + React Dashboard；构建产物 `apps/web/dist/` 作为 Worker static assets。
- `apps/web/src/pages/` — Setup、Login、Projects、Project 详情页。
- `apps/web/src/i18n/` — 中英文文案（`en` / `zh-CN`，默认 `zh-CN`）。
- `packages/shared/` — 跨包共享类型、`ErrorCode`、`apiError()` 辅助函数；改类型时 API 与 Web 同步更新。
- `README.md` — 架构说明、curl 验收路径、部署流程（权威参考）。
