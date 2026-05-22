# Cloudflare 部署指南

本文档说明如何使用 Cloudflare Pages、Cloudflare Workers 和 Durable Objects 部署 Rating;Gate。

## 架构

```text
example.com
  /      -> Cloudflare Pages 前端
  /ws*   -> Cloudflare Worker
            -> Durable Object 内存房间状态
```

生产环境未配置 `VITE_WS_URL` 时，前端默认连接当前域名下的 `wss://<host>/ws`。若站点部署在 `https://ratinggate.cn`，多人联机服务默认使用 `wss://ratinggate.cn/ws`。

动画、漫画、轻小说和 Galgame 题库通过 GitHub Actions 在北京时间每周一 00:00 自动重新生成并提交到仓库。Cloudflare Pages 连接 GitHub 仓库后，会在数据提交后触发一次前端部署。

## 计量优化策略

- 服务端不做逐秒倒计时广播。
- 限时模式开始时只广播 `startAt` 和 `durationMs`。
- 前端根据 `startAt + durationMs` 本地渲染倒计时。
- 房间状态保存在 Durable Object 内存中，不写入持久化存储。
- 不维护服务器端持久排行榜，只在当局结算时广播房间内排名。
- 房间无人后立即清理内存状态和计时器。
- 经典模式只在玩家作答、结算、进入下一题等状态变化时广播。
- 限时模式只在玩家作答和比赛结束时广播。

## 前端部署

Cloudflare Pages 使用仓库根目录构建：

```text
Install command: npm ci
Build command: npm ci && npm run build
Output directory: dist
Deploy command: 留空
```

Pages 只负责部署前端静态资源，不应在 Pages 的 Deploy command 中执行 `npx wrangler deploy`。Worker 需要按下方步骤单独部署。

若前端和 Worker 共用同一域名，Pages 环境变量通常无需设置。若需要显式指定联机服务地址，可设置：

```text
VITE_WS_URL=wss://<站点域名>/ws
```

仓库中的 `Update Bangumi Data` 工作流也可以在 GitHub Actions 页面手动运行，用于立即刷新四类题库并触发一次 Pages 部署。

## Worker 部署

Worker 代码位于 `worker/`：

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

也可以在仓库根目录执行：

```bash
npm run worker:deploy
```

`worker/wrangler.toml` 中的默认路由为：

```text
ratinggate.cn/ws*
```

如果使用其他域名，需要同步修改 `worker/wrangler.toml` 中的 `routes` 配置。

部署后，`/ws` 路径由 Worker 处理，其余页面路径继续由 Cloudflare Pages 处理。

### 通过 Cloudflare 控制台单独部署 Worker

如果使用 Cloudflare 的 Git 集成部署 Worker，应创建独立的 Worker 项目，并将项目根目录设置为：

```text
worker
```

推荐配置：

```text
Install command: npm ci
Build command: npm run typecheck
Deploy command: npm run deploy
```

如果无法设置 Worker 项目根目录，也可以在仓库根目录使用：

```text
Deploy command: npm run worker:deploy:ci
```

该方式需要在 Cloudflare 项目环境变量中配置有权限部署 Worker 和 Durable Objects 的 `CLOUDFLARE_API_TOKEN`。

## 上线验证

普通浏览器访问：

```text
https://<站点域名>/ws
```

应返回类似：

```json
{"ok":true,"rooms":0,"endpoint":"/ws","storage":"memory"}
```

随后验证页面功能：

- 首页可以正常打开
- 单人挑战可以切换动画、漫画、轻小说和 Galgame 题库并答题
- 漫画与轻小说的媒体专属筛选可正常收窄题池
- Galgame 全年龄/非全年龄筛选可用，非全年龄条目使用标题封面
- 多人模式显示“联机已连接”
- 浏览器 A 创建房间，浏览器 B 输入房间码加入
- 房主开始比赛后，两端进入同一个比赛舞台
- 房主切换题库后，其他玩家看到同步后的题库设置
- 经典同步赛中，一方作答后卡片出现选中高亮
- 双方作答后出现排名弹窗
- 点击“回到大厅”后双方同步回到大厅

## 本地开发

前端：

```bash
npm run dev
```

本地 WebSocket 服务：

```bash
npm run dev:ws
```

本地模式使用 `ws://127.0.0.1:8787`，用于在不依赖 Cloudflare 的情况下调试前端和房间协议。

## 常见问题

### 多人模式提示无法连接联机服务

检查 Pages 环境变量中的 `VITE_WS_URL` 是否指向正确的 Worker 地址。同域名方案下可以不设置该变量，或设置为 `wss://<站点域名>/ws`。

### `/ws` 返回 Pages 页面或 404

检查 Worker route 是否生效。使用 `ratinggate.cn` 时，路由应为：

```text
ratinggate.cn/ws*
```

### 修改 Worker 后没有生效

Worker 需要单独部署：

```bash
cd worker
npx wrangler deploy
```

### Pages 构建日志出现 `Could not find Vite config file to modify`

该错误通常表示在仓库根目录执行了 `npx wrangler deploy`，但 Worker 的 `wrangler.toml` 实际位于 `worker/` 子目录。处理方式：

- Cloudflare Pages 的 Deploy command 留空。
- Worker 单独部署，或在 `worker/` 目录运行 `npx wrangler deploy`。
- 若必须从仓库根目录部署 Worker，使用 `npm run worker:deploy:ci`，不要直接使用 `npx wrangler deploy`。
