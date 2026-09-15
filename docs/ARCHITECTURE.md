# 薄荷溪居架构说明

## 阶段 2 当前架构

当前版本由两个本地进程组成：

- Vinext/React 前端运行在 `http://localhost:5173`。
- 标准 Cloudflare Worker 运行在 `http://localhost:8787`，通过 `DB` binding 使用本地 D1。

浏览器读取 `VITE_LIFE_API_BASE_URL` 后直接跨域调用 Worker。Next API 路由和 Cookie 后端已经删除，不存在正式或隐藏的转发层。

数据模型只有一个个人账号：

- `users` 保存唯一账号的登录资料、个人设置、月度重点和修订号。
- `sessions` 只保存 Bearer token 的 SHA-256 摘要、设备摘要、可读设备名称、UA 摘要、创建/最近使用/到期/撤销时间。
- `records` 保存睡眠、学习、餐饮和习惯打卡记录。
- `habits` 保存运动、清洁、每日 SOP 和自定义项目。
- `attempts` 保存登录尝试限流状态。

邀请、成员角色、亲友分享、用户所有权字段和用户图片功能均已移除。水彩花束、植物小屋和溪流是静态界面素材。

原始 Bearer token 只返回给登录设备，并保存在该浏览器的 `localStorage`。退出登录会撤销 Worker 会话并清除本地 token；`401` 也会清除本地 token。统计和 Excel 文件生成继续在浏览器端完成。

Worker 对所有 `/api/life/*` 请求先执行精确 Origin 校验。`ALLOWED_ORIGINS` 缺失、包含 `*` 或包含非法项目时关闭业务访问。合法响应返回精确 Origin 和 `Vary: Origin`，不使用 Cookie 或 `Access-Control-Allow-Credentials`。

本阶段没有创建、修改或连接任何云端资源。

## 已确认的目标架构

- 前端：GitHub Pages 上的纯静态 React 应用。
- 后端：Cloudflare Workers Free。
- 数据库：Cloudflare D1 Free。
- 备份：GitHub Actions 每天导出 D1，备份保存在独立私有仓库；网页继续提供手动导出。
- 用户：一个个人账号，可在自己的手机和电脑登录。
- 网络目标：免费、跨设备公网访问、尽力覆盖中国大陆网络，不承诺大陆稳定性。
- 费用边界：不绑定付款方式，不启用付费计划，不接受按量计费。

## 阶段 3 接手项

- 将当前 Next/Vinext 页面改成 GitHub Pages 可发布的静态前端。
- 设置 Vite `base` 和正式 `VITE_LIFE_API_BASE_URL`。
- 将准确的 GitHub Pages Origin 写入 Worker `ALLOWED_ORIGINS`；Origin 不含仓库路径。
- 增加设备会话管理界面，复用阶段 2 的 `GET /sessions` 与 `DELETE /sessions/:id`。
- 阶段 2 的 Worker API、Bearer 客户端和业务行为保持不变。

## 修订后的完整阶段

0. 建立 Git 基线、本地状态备份、SQL 导出和恢复演练。
1. 删除多人、邀请、分享和全部用户图片功能，迁移为单用户数据模型。
2. 将 API 拆分为独立 Cloudflare Worker，完成单用户认证与严格来源白名单。
3. 将前端改为 GitHub Pages 可发布的静态应用，保持手机和电脑响应式体验。
4. 增加 GitHub Actions 每日 D1 加密备份、手动完整导出和恢复演练。
5. 增加 Free 方案部署流程、额度保护、运维与灾难恢复说明。

每一阶段单独提交、单独验收；上一阶段通过后才进入下一阶段。
