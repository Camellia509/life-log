# 本地备份与恢复说明

## 阶段 0 备份位置

本次基线备份保存在 `backups/stage0-baseline-20260914/`。`backups/` 已加入 `.gitignore`，其中可能包含账号资料和密码派生值，禁止提交到 GitHub、聊天附件或公开网盘。

目录内容：

- `wrangler-state.zip`：第一版本地 `.wrangler/state` 的完整归档，包含 D1 状态和当时的本地 R2 状态。
- `d1-baseline.sql`：从实际本地 D1 SQLite 数据库导出的完整 SQL。
- `restore-state/restored.sqlite`：在全新目录中由 SQL 建立的恢复演练数据库。
- `restore-verification.json`：源库与恢复库的完整性、逐表行数及内容哈希比对结果，不包含记录正文。
- `SHA256SUMS.txt`：备份文件校验值。

## 恢复第一版本地状态

1. 停止本地预览服务。
2. 将当前 `.wrangler/state` 改名保存，不要直接删除。
3. 解压 `wrangler-state.zip`，将其中的 `state` 目录放回项目 `.wrangler/state`。
4. 运行现有本地服务并检查登录、记录、习惯和图片功能。

这是第一版的完整回退方式。阶段 1 以后，图片和 R2 会从新架构中移除，但该归档仍保留第一版状态。

## 从 SQL 恢复 D1 数据

`d1-baseline.sql` 是与 SQLite/D1 兼容的完整导出。恢复时应导入一个空白数据库或全新的本地持久化目录，禁止直接覆盖正在使用的数据库。

恢复完成后必须检查：

1. `PRAGMA integrity_check` 返回 `ok`。
2. 所有预期表存在。
3. 源库和恢复库逐表行数一致。
4. 每张表的规范化行内容 SHA-256 一致。

本阶段已通过 `scripts/verify-sql-backup.py` 在独立目录执行上述演练。后续迁移会在每次 Schema 变更前重新运行同等验证。

## 恢复演练的安全要求

- 永远使用新的恢复目录或新的 D1 数据库。
- 不在日志中打印记录正文、邮箱、会话令牌或密码派生值。
- 先验证备份哈希，再导入。
- 恢复成功后先运行测试，再切换实际数据目录。
