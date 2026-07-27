# CFBridge

单管理员、多项目的 Cloudflare 网关：把 KV（Upstash 风格 Redis REST）和 D1 以稳定 HTTP API 暴露给任意云上的应用。管理端 + 数据面 + Dashboard 部署在同一个 Worker（`cfbridge`）上；Meta D1 存项目、资源映射和哈希后的 API Key。改动时要分清管理 API（`/admin`）、数据 API（`/v1`）和 SPA 静态资源三条路径。

## Language

使用中文（zh-CN）回复。代码标识符、API 路径、错误码保持英文。

## Persistent memory

稳定约定写入 `.ai/`（不要写进 `AGENTS.md` 或 `CLAUDE.md`）。用 `/cfbridge-remember` 或说「记住这个」添加；agent 发现可复用约定时会提议保存，确认后再写。
