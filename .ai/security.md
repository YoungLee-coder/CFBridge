# Security Boundaries

## Critical Safety Rules

- 永远不要提交 `apps/api/.dev.vars`、`.env` 或含真实 token 的文件。
- `CLOUDFLARE_API_TOKEN` 具备 KV/D1 写权限——仅在 Worker 环境使用，不要打到前端或日志。
- API Key 明文只在创建时返回一次；数据库存哈希（`crypto.ts`），不要记录或缓存明文 Key。
- 管理会话用 `SESSION_SECRET` 签名；`ADMIN_PASSWORD` 比较走 `timingSafeEqual`——不要换成普通字符串比较。
- 删除项目时 `?delete_cf=true` 会经 Cloudflare API 删除远端 KV/D1——默认不启用，需用户明确确认。
- Meta D1 迁移（`db:migrate:remote`）作用于生产库——先本地验证，再远程执行。
- 数据面 `anon` Key 受 `anon_readonly` 约束；写操作必须 `service_role`。
- KV TTL（`EX`/`SETEX`/`EXPIRE`）最低 60 秒（Cloudflare 限制）——校验逻辑在 `redis.ts`，不要绕过。
