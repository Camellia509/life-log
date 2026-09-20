# 阶段 4 本地空库恢复演练

- 日期：2026-09-20
- 命令：`npm run backup:rehearse`
- 数据源：本地 `.wrangler/state` 中唯一业务 D1 SQLite 文件
- 目标：独立临时 SQLite，未连接或修改任何远程 D1
- 结果：通过

```json
{
  "integrity": "ok",
  "schemaSha256": "5a4b0900d825f541c21417aaadcbfe4671fe8167681953070307acd2292086c4",
  "tables": {
    "_cf_METADATA": { "rows": 1, "sha256": "b4f75747a2c062db979c51944766fc62712aa47af5d2fd80f8478271a036dadd" },
    "attempts": { "rows": 0, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    "habits": { "rows": 0, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    "records": { "rows": 0, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    "sessions": { "rows": 0, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
    "users": { "rows": 0, "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
  },
  "sqlSha256": "8f5688bd90d0f6cd219929252e7139f2977cffc96d3d0b1cc8b7dc2b56621ce2",
  "exportRestoreMatches": true,
  "decryptRestoreMatches": true,
  "plaintextRemoved": true,
  "ephemeralPrivateKeyRemoved": true
}
```

保留的三个本地产物为 `backup-2026-09-20.sql.age`、`manifest-2026-09-20.json.age` 和 `backup-2026-09-20.sha256`。它们使用仅供本次演练的临时密钥加密；脚本已删除该私钥，因此这些密文只用于证明流程，不作为可恢复的正式备份。
