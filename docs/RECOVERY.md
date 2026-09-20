# 本地备份与恢复说明

## 恢复点

恢复点均位于被 Git 忽略的 `backups/`：

- `backups/stage0-baseline-20260914/`：阶段 0 的完整第一版本地基线。
- `backups/stage1-pre-migration-20260914/`：阶段 1 删除表和字段之前再次建立的恢复点。
- `backups/stage2-pre-bearer-20260915/`：阶段 2 增加设备会话字段之前建立的恢复点。

恢复点至少包含：

- `wrangler-state.zip`：当时的完整 `.wrangler/state`。
- `d1-baseline.sql`：实际本地 D1 SQLite 数据库的全量 SQL。
- `restore-state/restored.sqlite`：在独立新目录中由 SQL 建立的恢复数据库。
- `restore-verification.json`：源库与恢复库的完整性、逐表行数和内容哈希比对结果，不含记录正文。
- `SHA256SUMS.txt`：备份文件校验值。

备份可能包含账号资料和密码派生值，不得提交到 GitHub、聊天附件或公开网盘。

## 恢复完整本地状态

1. 停止本地预览服务。
2. 将当前 `.wrangler/state` 改名保存，禁止直接删除。
3. 解压所选恢复点的 `wrangler-state.zip`。
4. 将解压得到的 `state` 目录放回项目 `.wrangler/state`。
5. 运行对应版本源码并检查登录和核心数据。

阶段 0 恢复点应配合阶段 0 Git 提交 `125029d31952a477dcccb25d486e944145771ac5` 使用。阶段 1 源码不可直接读取旧 Schema，需先运行阶段 1 迁移。

## 从 SQL 恢复

`d1-baseline.sql` 应导入空白数据库或全新的本地持久化目录，不能覆盖正在使用的数据库。恢复后必须确认：

1. `PRAGMA integrity_check` 返回 `ok`。
2. 所有预期表存在。
3. 源库和恢复库逐表行数一致。
4. 每张表规范化行内容的 SHA-256 一致。

`scripts/verify-sql-backup.py` 已用于这些恢复点的独立恢复演练。

阶段 2 会话迁移是纯增量。只回滚代码时可保留新增列，阶段 1 的 `token/user_id/expires` 查询仍可工作；Bearer 登录设备需要重新登录。若要完全回到阶段 1 Schema，应在新目录导入阶段 2 前 SQL 并完成上述四项验证，不能直接对当前数据库执行反向删除字段。

阶段 4 新增的每日加密备份、网页完整 JSON 及灾难恢复步骤见 [自动备份、加密与完整恢复](BACKUP_AND_RESTORE.md)。
