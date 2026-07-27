---
name: cfbridge-release-check
description: Verify release readiness for CFBridge — run checks, confirm version, validate changelog. Use before release / 发布前检查 / release readiness.
---

# Release Check

Verify that CFBridge is ready for release.

## Steps

1. **Run typecheck**: `pnpm typecheck` — Worker + web 必须通过。
2. **Run build**: `pnpm build` — vite 输出到根目录 `dist/`。
3. **Check version**: 确认根 `package.json` 版本（当前为 `0.1.0`）。
4. **Manual smoke test**: 按 `README.md` curl 路径验证管理端与数据面（本地 `pnpm dev` 或 staging Worker）。
5. **Deploy checklist**:
   - `wrangler.toml` 无生产用 `database_id`（Meta D1 在面板绑 `META`）。
   - Secrets 已在 Cloudflare 面板配置：`ADMIN_PASSWORD`、`SESSION_SECRET`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`。
   - Setup 页可完成 schema 初始化/升级。
6. **Security scan**: 对自上次 tag 以来的 diff 调用 `security-auditor` subagent。
7. **Report**: 汇总结果；任一检查失败则列出修复项。

CFBridge-specific:
- 发布命令：`pnpm deploy`（先 build web 再 `wrangler deploy`）。
- 无自动化测试套件——手动 curl + Dashboard 验证为必选项。
- 无正式 CHANGELOG 文件——发布说明可写在 GitHub Release 或 commit 摘要中。
