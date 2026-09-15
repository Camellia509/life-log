# 薄荷溪居架构说明

## 阶段 3 当前架构

前端是纯 React + Vite 静态应用：

- 开发服务器：`http://localhost:5173/life-log/`。
- 静态预览：`http://localhost:4173/life-log/`。
- 目标 Pages：`https://camellia509.github.io/life-log/`。
- Vite `base`：`/life-log/`。
- 页面路由：Hash 路由 `#/`、`#/records`、`#/habits`、`#/settings`。

构建产物只有 `dist/index.html`、静态素材和哈希命名的浏览器资源。Next、Vinext、React Server Components、Sites 托管适配及前端 D1 binding 已移除。不存在 API 转发层或服务端渲染入口。

浏览器读取 `VITE_API_BASE_URL`，直接调用 `${VITE_API_BASE_URL}/api/life/*`。生产变量尚未填写；缺失时页面显示配置错误，不会连接 localhost。统计和 Excel 生成继续在浏览器完成。

后端保持阶段 2 的独立 Cloudflare Worker：

- `users`：唯一账号、设置和月度重点。
- `sessions`：Bearer token 摘要、设备摘要、设备名称、创建/最近使用/到期/撤销时间。
- `records`：睡眠、学习、餐饮和习惯打卡。
- `habits`：运动、清洁、每日 SOP 和自定义项目。
- `attempts`：登录失败限流。

“个人设置”通过已有 `GET /sessions` 和 `DELETE /sessions/:id` 展示并撤销设备会话，没有新增 Worker 业务接口。

Worker 的精确 Origin 白名单包含：

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:4173`
- `http://127.0.0.1:4173`
- `https://camellia509.github.io`

GitHub Pages Origin 不含仓库路径。`ALLOWED_ORIGINS` 缺失、含 `*` 或有非法项目时继续关闭业务访问，不使用 Cookie 或 `Access-Control-Allow-Credentials`。

邀请、成员角色、亲友分享、用户所有权字段和用户图片功能均已移除。水彩花束、植物小屋和溪流只是静态界面素材。

## GitHub Actions 边界

`.github/workflows/deploy.yml` 包含静态构建、检查、Pages artifact 和部署 job，但目前只有手动 `workflow_dispatch` 入口。本阶段没有推送代码、开启 Pages 或运行工作流。

仓库 Variables：

- `BASE_PATH=/life-log/`
- `VITE_API_BASE_URL`：阶段 5 部署 Worker 后填写。

前端工作流不需要自定义 Secrets。阶段 4 的 D1 备份凭据与阶段 5 的 Worker 部署凭据分别设计，不能暴露给浏览器构建。

## 阶段 4 接手项

1. 设计 GitHub Actions 每日 D1 导出。
2. 选择备份加密方式和独立私有备份仓库。
3. 设计备份保留周期和安全清理。
4. 校验记录、习惯、设置、月度重点和统计结果。
5. 定期恢复到新 D1，记录可审计结果。
6. 完善网页手动完整导出和恢复说明。

阶段 4 不恢复图片、多人、邀请或分享。阶段 5 才部署 Worker、填写正式 `VITE_API_BASE_URL`、启用 Pages、确认额度保护并决定是否加入 PWA。

## 完整阶段

0. 建立 Git 基线、本地状态备份、SQL 导出和恢复演练。
1. 删除多人、邀请、分享和全部用户图片功能，迁移为单用户数据模型。
2. 将 API 拆分为独立 Cloudflare Worker，完成 Bearer 设备会话与严格来源白名单。
3. 将前端改为 GitHub Pages 可发布的纯静态应用，增加 Hash 路由和设备会话界面。
4. 增加 GitHub Actions 每日 D1 备份、手动完整导出和恢复演练。
5. 执行 Free 方案部署，填写生产地址，配置额度保护、运维和灾难恢复。

每个阶段独立提交和验收。目标是免费、跨设备公网访问、尽力覆盖中国大陆网络，不承诺大陆稳定性。
