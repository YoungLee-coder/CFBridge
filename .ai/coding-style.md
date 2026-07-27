# Coding Style & Conventions

- TypeScript ESM（`"type": "module"`）；根目录单包；共享类型经 path alias `@cfbridge/shared` → `shared-types/`。
- 管理 API 错误响应用 `jsonError()` / `badRequest()` 等（`src/lib/http.ts`），信封为 `{ error: { code, message } }`（类型来自 `@cfbridge/shared`）。
- 数据面 Redis 兼容层用 Upstash 风格 `{ result }` / `{ error: "ERR …" }`，与管理端信封不同——勿混用。
- 共享类型和 `apiError()` 放 `shared-types/`，API 与 Web 共用；改接口先改 shared-types。
- Hono 路由按 `routes/admin/` 和 `routes/v1/` 分目录；新管理路由挂到 `src/index.ts` 并考虑 `requireReady` 中间件。
- `wrangler.toml` 生产配置不写 Meta D1 的 `database_id`——面板绑 `META`，避免 deploy 覆盖绑定。本地开发用 `wrangler.dev.toml`。
- Web 文案走 `web/src/i18n/`，新增 UI 字符串同时补 `en.ts` 和 `zh-CN.ts`。
- 无 Prettier/ESLint 配置；保持与周边文件一致的缩进和引号风格。
- Commit message：简洁英文或中文，说明 why；不要加 AI 署名 trailer。
