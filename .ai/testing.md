# Testing Strategy

当前无自动化测试框架（`package.json` 中无 test script）。

手动验证为主：
- 类型检查：`pnpm typecheck`
- API 行为：`README.md` 中的 curl 验收路径（登录 → 建项目 → 挂资源 → 签发 Key → Redis/D1 读写）
- Dashboard：`pnpm dev` 后访问 http://127.0.0.1:8787

## Per-change verification

- `apps/api/` 或 `packages/shared/`：先 `pnpm typecheck`，再按需 curl 数据面/管理面。
- `apps/web/`：`pnpm typecheck`，必要时 `pnpm dev:web` 检查页面。
- `apps/api/migrations/`：`pnpm db:migrate:local`，Setup 页确认 schema 版本。
