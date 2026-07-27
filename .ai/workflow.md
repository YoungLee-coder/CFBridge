# Development Workflow

## Commands

```bash
pnpm install                                    # 安装依赖
cp .dev.vars.example .dev.vars                  # 本地 secrets（首次）
pnpm dev                                        # wrangler :8787 + vite :5173（并行）
pnpm dev:api                                    # 仅 Worker（需已有 dist/）
pnpm dev:web                                    # Vite :5173，/admin 和 /v1 代理到 :8787
pnpm build                                      # vite build → ./dist
pnpm typecheck                                  # Worker + web typecheck
pnpm deploy                                     # build + wrangler deploy
pnpm db:migrate:local                           # 本地 Meta D1 迁移（需 wrangler.toml 取消注释 [[d1_databases]]）
pnpm db:migrate:remote                          # 远程 Meta D1 迁移
```

本地开发需配置根目录 `.dev.vars`：`ADMIN_PASSWORD`、`SESSION_SECRET`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`。

Workers Builds（Git）：Build `pnpm run build`，Deploy `npx wrangler deploy`（或 `pnpm exec wrangler deploy`）。

## Verification

- API / shared 类型改动：运行 `pnpm typecheck`。
- Web UI 改动：运行 `pnpm typecheck`，必要时 `pnpm dev:web` 手动验证。
- 数据面行为：参考 `README.md` curl 验收路径，对 `:8787` 做端到端测试。
- Meta schema 改动：更新 `migrations/`，运行 `pnpm db:migrate:local`，通过 Setup 页验证迁移。
- 仅文档改动：检查命令与路径是否与代码一致。
