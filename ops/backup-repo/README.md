# life-log-backups 工作流模板

此目录只是阶段 4 的离线模板，不会被主仓库 GitHub Actions 自动发现或执行。阶段 5 创建私有 `life-log-backups` 仓库后，才把 `.github/workflows/backup.yml` 复制到该私有仓库。

工作流先在 runner 临时目录完成远程 D1 导出、SQLite 恢复校验、age 加密和 SHA-256 校验。只有这些步骤全部成功后，才读取旧 `backups` 分支，执行保留策略，并以 `--force-with-lease` 更新快照分支。任何校验失败都不会写远端分支。

正式配置、密钥名称和启用步骤见 `docs/BACKUP_AND_RESTORE.md`。主仓库与备份仓库都不能保存 age 私钥。
