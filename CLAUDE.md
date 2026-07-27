<!-- ai-init-version: 6 -->
# CFBridge — Claude Code Instructions

Project knowledge is distributed across `.ai/`. Read these files before non-trivial work:

- `.ai/project.md` — project background, response language
- `.ai/architecture.md` — tech stack, repository map, entry points
- `.ai/coding-style.md` — conventions, helpers, gotchas
- `.ai/workflow.md` — commands, verification, release flow
- `.ai/testing.md` — test strategy, per-change verification
- `.ai/security.md` — safety rules, destructive-op guardrails

Claude-specific notes:
- 优先用 Edit 改已有文件；类型/接口改动从 `packages/shared` 开始。
- **Persistent memory:** 发现稳定约定缺失于 `.ai/` 时，提议保存并确认后再写。用 `/cfbridge-remember` 或按 `.ai/project.md` Persistent memory 章节路由。
- Put personal overrides in `CLAUDE.local.md` (gitignored).
