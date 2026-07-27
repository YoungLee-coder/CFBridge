---
name: cfbridge-implement-feature
description: Implement a new feature in CFBridge, following project conventions from .ai/ files. Use when asked to add a feature / implement something / build X.
---

# Implement Feature

Implement a new feature following the conventions defined in `.ai/`:

1. **Read project context**: `.ai/project.md` (what this is), `.ai/architecture.md` (where things go), `.ai/coding-style.md` (how to write), `.ai/workflow.md` (commands and verification).
2. **Plan the change**: identify which files to modify, which layers are involved, which conventions apply.
3. **Implement**: write the code following `.ai/coding-style.md` conventions. Use the helpers and patterns documented there, not raw alternatives.
4. **Verify**: run the commands from `.ai/workflow.md` Verification section for the change type you made. If there are tests in `.ai/testing.md` for the area you touched, run those too.
5. **Review**: if the change is non-trivial, invoke the code-reviewer and/or architect subagent before considering it done.
6. **Memory**: if you discovered a stable convention or gotcha missing from `.ai/`, propose saving it (confirm before writing — see `/cfbridge-remember`).

CFBridge-specific:
- 类型/接口改动从 `shared-types/` 开始，再改 API（`src/`）与 Web（`web/`）。
- 新管理 API 用 `jsonError()` 系列 helper；数据面 Redis 保持 Upstash 兼容信封。
- Web UI 新文案同时更新 `web/src/i18n/en.ts` 和 `zh-CN.ts`。
- 涉及 Meta schema 时新增 migration 并本地 `pnpm db:migrate:local` 验证。
