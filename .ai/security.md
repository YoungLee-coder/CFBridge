# Security Boundaries

## Critical Safety Rules

- 永远不要提交 `.dev.vars`、`.env` 或含真实 token 的文件。
- `CLOUDFLARE_API_TOKEN` 具备 KV/D1 写权限——仅在 Worker 环境使用，不要打到前端或日志。
- API Key 明文只在创建时返回一次；数据库存哈希（`crypto.ts`），不要记录或缓存明文 Key。
- 管理会话用 `SESSION_SECRET` 签名；`ADMIN_PASSWORD` 比较走 `timingSafeEqual`——不要换成普通字符串比较。
- 会话 cookie 须 `HttpOnly` + `SameSite=Lax`；HTTPS 下加 `Secure`。Dashboard 只用 cookie（`credentials: include`），不要把管理 token 写入 `localStorage`。
- `/admin` CORS 只允许同部署 Origin 且可带 credentials；`/v1` 用 `origin: "*"`、不要带 credentials（Bearer Key）。
- `anon_readonly` 门禁须对多语句 SQL 拆分后再判读写（`isWriteSql` / `splitSqlStatements`）——不要只看首句。
- 删除项目时 `?delete_cf=true` 会经 Cloudflare API 删除远端 KV/D1——默认不启用，需用户明确确认。
- Meta D1 迁移（`db:migrate:remote`）作用于生产库——先本地验证，再远程执行。
- 数据面 `anon` Key 受 `anon_readonly` 约束；写操作必须 `service_role`。
- KV TTL（`EX`/`SETEX`/`EXPIRE`）最低 60 秒（Cloudflare 限制）——校验逻辑在 `redis.ts`，不要绕过。
- Redis 数据面只接受 `Authorization: Bearer`；不要恢复 `?_token=`。
- `/health` 未认证只返回 `{ ok: true }`；Setup 细节走 `/admin/setup/status`。全局 `onError` 勿把 `err.message` 回给客户端。
