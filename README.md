# 薄荷溪居

“薄荷溪居”是个人长期使用的生活与学习记录网页。阶段 3 已将前端改为纯 React + Vite 静态应用，可构建为 GitHub Pages 文件；后端仍是独立 Cloudflare Worker + D1。当前没有部署或连接任何云端资源。

## 功能

- 水彩花束、植物屋顶小屋、溪流与浅薄荷绿、暖黄色界面。
- 单一个人账号，Bearer 设备会话，关闭浏览器后保持登录。
- 睡眠、学习、餐饮、运动、清洁和每日 SOP。
- 月度统计、日期筛选、月度重点和自定义习惯。
- Excel 导入预览、去重、当前月导出和全部导出。
- 登录设备列表、最近使用时间和单独撤销。
- 带内容校验的完整 JSON 手动导出，以及仅恢复记录的安全预览导入。

网页不提供用户图片上传、分享、邀请或多人功能。界面插画随静态前端发布，不进入个人数据库。

## 本地开发

需要 Node.js 22.13 或更新版本。先启动本地 Worker：

```powershell
npm ci
npm run worker:db:init
npm run worker:dev
```

另开一个 PowerShell 窗口启动前端：

```powershell
npm run dev
```

- 前端：<http://localhost:5173/life-log/>
- Worker：<http://localhost:8787/>

开发环境默认连接本地 Worker，也可在被 Git 忽略的 `.env.local` 中设置：

```text
VITE_API_BASE_URL=http://localhost:8787
BASE_PATH=/life-log/
```

`VITE_API_BASE_URL` 只填写 Worker Origin，客户端会自动添加 `/api/life`。它是公开构建变量，不能写入密码、Bearer token 或 Cloudflare 凭据。

## 模拟 GitHub Pages

项目确定发布到：

```text
https://Camellia509.github.io/life-log/
```

本地生成同样子路径的静态文件：

```powershell
$env:BASE_PATH="/life-log/"
$env:VITE_API_BASE_URL="http://localhost:8787"
npm run build
npm run preview
```

访问 <http://localhost:4173/life-log/#/>。栏目使用 `#/records`、`#/habits` 和 `#/settings`，刷新时 GitHub Pages 始终读取 `/life-log/`，不会请求不存在的服务器路由。

生产构建缺少 `VITE_API_BASE_URL` 时仍能生成静态文件，但页面会明确提示 API 未配置，不会回退到本机地址。正式 Worker URL 留到阶段 5 部署后填写。

## GitHub Pages 工作流

`.github/workflows/deploy.yml` 当前只有 `workflow_dispatch`，不会因提交自动运行。本阶段不推送、不启用 Pages、不执行部署。

未来需要在公开仓库 `Camellia509/life-log` 设置 Actions Variables：

| Variable | 值 |
| --- | --- |
| `BASE_PATH` | `/life-log/` |
| `VITE_API_BASE_URL` | 阶段 5 得到的 Worker Origin |

不需要自定义 GitHub Secret。Pages 使用 Actions 自动提供的 `GITHUB_TOKEN`。Cloudflare 和备份凭据不属于前端工作流。

Worker 的 `ALLOWED_ORIGINS` 已包含本地开发、静态预览和规范化的小写 Origin `https://camellia509.github.io`。域名不区分大小写，Origin 不含 `/life-log/`。配置缺失、包含 `*` 或格式非法时，Worker 关闭业务访问。

## 检查

```powershell
npm run typecheck
npm run worker:typecheck
npm run lint
npm run worker:dry-run
npm test
npm run build
npm run test:static
npm run backup:rehearse
```

静态构建输出到被 Git 忽略的 `dist/`：顶层是 `index.html`、favicon 和两张水彩素材，编译后的 JavaScript/CSS 位于 `dist/assets/`。没有服务端 bundle、数据库或个人数据。

## 数据与恢复

本地 D1 位于 `.wrangler/state`，不要删除。网页可分别导出 Excel 记录与带校验的完整 JSON。阶段 4 已准备独立私有仓库的加密 D1 备份模板，但尚未启用。迁移、恢复和架构边界见 [架构说明](docs/ARCHITECTURE.md)、[数据迁移说明](docs/DATA_MIGRATION.md)、[本地恢复说明](docs/RECOVERY.md)与[自动备份和完整恢复](docs/BACKUP_AND_RESTORE.md)。

目标仍是免费、跨设备公网访问、尽力覆盖中国大陆网络，不承诺大陆稳定性。不购买域名，不绑定付款方式，不启用付费计划或按量计费。
