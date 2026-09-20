# 自动备份、加密与完整恢复

## 两类备份的分工

网页“导出全部数据”生成带 SHA-256 内容校验的 JSON，包含记录、习惯、设置、月度重点、账号基本资料和脱敏设备会话元数据，不包含密码派生值、盐、Bearer token、设备标识摘要或登录失败记录。它适合随手下载和检查；网页导入时只预览习惯、设置等摘要，并只恢复记录，避免误覆盖当前配置。

加密 D1 SQL 是灾难恢复主备份，覆盖数据库完整 Schema 和数据，包括登录所需的密码派生值。它必须使用 age 公钥加密后才能离开临时目录，只存入独立私有仓库。完整还原账号、设置、习惯和会话时使用它。

## 阶段 4 工作流模板

模板位于 `ops/backup-repo/.github/workflows/backup.yml`，不在主仓库可执行目录中，因此当前不会触发。阶段 5 才将它复制到私有 `life-log-backups` 仓库并启用。

每次运行依次执行：

1. 将远程 D1 完整导出到 runner 临时目录。
2. 在独立 SQLite 文件中恢复 SQL，执行 `PRAGMA integrity_check`，计算 Schema 哈希、逐表行数和内容哈希。
3. 用 `BACKUP_AGE_RECIPIENT` 公钥加密 SQL 与校验清单，并为两个密文生成 SHA-256 文件。
4. 再次校验密文 SHA-256。
5. 只有以上步骤成功后，才合并旧快照、执行保留策略并创建新快照提交。
6. 用 `--force-with-lease` 更新私有仓库的 `backups` 分支；若远端分支在运行期间改变，推送失败而不会覆盖新内容。
7. 无论成功失败，都清理 runner 中的明文 SQL、临时 Wrangler 配置和工具目录。

默认保留最近 7 个每日点、4 个不同周的周点和 6 个不同月的月点，三类取并集。同一日期只有 SQL 密文、清单密文和 SHA-256 文件三者齐全时才参与清理。以后可通过 `DAILY_KEEP`、`WEEKLY_KEEP`、`MONTHLY_KEEP` 调整。工作流同时支持 GitHub 页面中的 **Run workflow** 手动触发。

## 阶段 5 才配置的内容

私有备份仓库 Secrets：

| Secret | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 仅允许读取并导出目标 D1 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号定位 |
| `D1_DATABASE_ID` | 目标 D1 标识 |
| `BACKUP_AGE_RECIPIENT` | age 公钥，形如 `age1...` |

私有备份仓库 Variables：

| Variable | 建议值 |
| --- | --- |
| `D1_DATABASE_NAME` | 阶段 5 创建的数据库名 |
| `LIFE_LOG_SOURCE_REPOSITORY` | `Camellia509/life-log` |
| `LIFE_LOG_SOURCE_REF` | 经审核的固定 tag 或 commit SHA |
| `DAILY_KEEP` | `7`，可省略 |
| `WEEKLY_KEEP` | `4`，可省略 |
| `MONTHLY_KEEP` | `6`，可省略 |

模板只使用私有仓库自身的 `GITHUB_TOKEN` 写同仓库，不需要跨仓库 deploy key。阶段 4 没有创建或配置上述项目。

## age 私钥保管

私钥应作为文件附件或安全笔记保存在可信密码管理器中，并在另一处保存一份离线加密副本，例如单独保管的加密 U 盘。恢复前应实际验证两份副本都能解密测试文件。不要把私钥放入 `life-log`、`life-log-backups`、GitHub Secrets、普通网盘、聊天记录或未加密磁盘目录。

私钥丢失后，已有 `.age` 备份将永久无法解密；age 没有重置密码、找回私钥或后台恢复机制。生成新密钥只能保护未来备份，不能解开旧备份。

## 从加密 SQL 恢复到新 D1

先校验密文，再解密到受控临时目录：

```powershell
Get-FileHash .\backup-YYYY-MM-DD.sql.age -Algorithm SHA256
age --decrypt --identity C:\安全位置\life-log-backup-key.txt --output .\restore.sql .\backup-YYYY-MM-DD.sql.age
```

把 `restore.sql` 导入一个全新的本地或测试 D1，禁止直接覆盖生产库。先用仓库脚本验证：

```powershell
python scripts/verify-sql-backup.py --sql .\restore.sql --backup-dir .\restore-check
```

确认 `integrity=ok`、Schema 哈希、所有表行数和逐表哈希与解密后的 manifest 一致，再按 Cloudflare 当时的官方命令将 SQL 导入新 D1。阶段 5 部署前需要重新核对 Wrangler 的实际命令，不在阶段 4 访问云端。验证登录、记录、习惯、设置、月度重点和统计后，才切换 Worker binding。最后安全删除明文 SQL。

## 从网页 JSON 恢复记录

在“个人设置”选择“从 JSON 恢复记录”，页面先验证格式、版本和内容 SHA-256，再显示账号名、记录数、习惯数、月度重点数和会话数。确认后沿用现有导入接口写入记录。重复 ID 会按现有导入规则处理；习惯、设置、月度重点、账号和会话只预览，不自动覆盖。

## 本地空库演练

一条命令完成导出、临时密钥生成、加密、校验、解密和独立恢复：

```powershell
npm run backup:rehearse
```

首次执行会从 age 官方 GitHub Release 下载 v1.3.2，并核对脚本内固定的官方 SHA-256。产物写入被 Git 忽略的 `work/stage4-rehearsal/`。演练结束会删除明文 SQL、解密文件和临时私钥，仅保留密文、校验文件及不含行内容的报告。此次结果见 `docs/rehearsals/STAGE4_EMPTY_D1.md`。
