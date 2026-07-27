# Development Workflow

## Commands

```bash
pnpm install                                    # 安装依赖
cp apps/api/.dev.vars.example apps/api/.dev.vars  # 本地 secrets（首次）
pnpm dev                                        # build web + wrangler dev → :8787
pnpm dev:api                                    # 仅 Worker（需已有 apps/web/dist）
pnpm dev:web                                    # Vite :5173，/admin 和 /v1 代理到 :8787
pnpm build                                      # web build + api typecheck
pnpm typecheck                                  # 全 workspace typecheck
pnpm deploy                                     # build web + wrangler deploy
pnpm db:migrate:local                           # 本地 Meta D1 迁移（需 wrangler.toml 取消注释 [[d1_databases]]）
pnpm db:migrate:remote                          # 远程 Meta D1 迁移
```

本地开发需配置 `apps/api/.dev.vars`：`ADMIN_PASSWORD`、`SESSION_SECRET`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`。

## Verification

- API / shared 类型改动：运行 `pnpm typecheck`。
- Web UI 改动：运行 `pnpm typecheck`，必要时 `pnpm dev:web` 手动验证。
- 数据面行为：参考 `README.md` curl 验收路径，对 `:8787` 做端到端测试。
- Meta schema 改动：更新 `apps/api/migrations/`，运行 `pnpm db:migrate:local`，通过 Setup 页验证迁移。
- 仅文档改动：检查命令与路径是否与代码一致。
