---
name: cfbridge-remember
description: Add or update persistent project memory in .ai/ — conventions, gotchas, commands, safety rules. Use when the user asks to remember/save/add a rule, 加入记忆/规则/记住, or to capture something learned during work.
---

# Remember (add project memory)

Project memory lives in `.ai/` — shared by Claude Code and Cursor. **Never** duplicate shared facts into `AGENTS.md`, `CLAUDE.md`, or `.cursor/rules/`.

## User-invoked workflow

1. **Capture** — the user's words or a one-sentence summary from context.
2. **Route** — pick the target `.ai/` file (routing table below). If it spans files, split or pick the primary home.
3. **Draft** — imperative, terse, real paths/commands. Show the user: target file, section, and exact text to add or change.
4. **Confirm** — wait for yes. Never write silently.
5. **Write** — merge into the right section. Skip if already present or redundant.

## Routing

| Kind of memory | Target file |
|---|---|
| Coding convention, naming, helpers, gotchas | `.ai/coding-style.md` |
| Build / test / lint / format commands, verification steps, release, GitHub ops | `.ai/workflow.md` |
| Test framework, run-one-test, per-area test commands | `.ai/testing.md` |
| Repo map, layers, entry points, hotspot files | `.ai/architecture.md` |
| Safety, auth, destructive ops, secrets | `.ai/security.md` |
| Project background, response language | `.ai/project.md` |
| Personal or machine-only preference | `CLAUDE.local.md` / `AGENTS.local.md` (gitignored) |
| Cursor-only agent behavior (not a shared project fact) | `.cursor/rules/project-context.mdc` Cursor-specific notes |

## Proactive proposals (during any work)

When you notice a **stable** fact missing from `.ai/` that would help future agents — a convention, command, gotcha, layer boundary, or verification step — **pause and ask**:

> I noticed: "<fact in one sentence>". Should I add this to project memory (`.ai/<file>.md`)?

- Ask only for facts likely to recur; skip one-off task details.
- One proposal at a time; don't batch without confirmation.
- If the user says yes, follow the user-invoked workflow (draft → confirm → write).
- If the user declines, continue without saving.

CFBridge-specific:
- Gotcha 优先写入 `.ai/coding-style.md`，附一行原因。
- 安全相关写入 `.ai/security.md`。
- 回复语言用中文起草记忆条目（代码路径保持英文）。
