# Cloudflare 部署指南

EdgeOne 部署方案已弃用。当前部署方案使用 Cloudflare Pages 托管前端，并使用 Cloudflare Workers + Durable Objects 提供多人联机服务。

## 架构

```text
ratinggate.cn
  /      -> Cloudflare Pages 前端
  /ws*   -> Cloudflare Worker
            -> Durable Object 内存房间状态
```

生产环境未配置 `VITE_WS_URL` 时，前端默认连接当前域名下的 `wss://<host>/ws`。因此 `https://ratinggate.cn` 会自动连接 `wss://ratinggate.cn/ws`。

## 计量优化策略

- 服务端不做逐秒倒计时广播。
- 限时模式开始时只广播 `startAt` 和 `durationMs`。
- 前端根据 `startAt + durationMs` 本地渲染倒计时。
- 房间状态保存在 Durable Object 内存中，不写入持久化存储。
- 不维护服务器端持久排行榜，只在当局结算时广播房间内排名。
- 房间无人后立即清理内存状态和计时器。
- 经典模式只在玩家作答、结算、进入下一题等状态变化时广播。
- 限时模式只在玩家作答和比赛结束时广播。

## 前端 Pages 部署

Cloudflare Pages 使用仓库根目录构建：

```text
Install command: npm ci
Build command: npm ci && npm run build
Output directory: dist
```

若前端和 Worker 共用 `ratinggate.cn`，Pages 环境变量通常无需设置。若已经配置过旧的 `VITE_WS_URL`，需要删除或改为：

```text
VITE_WS_URL=wss://ratinggate.cn/ws
```

## Worker 部署

Worker 代码位于 `worker/`：

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

`worker/wrangler.toml` 已配置路由：

```text
ratinggate.cn/ws*
```

部署后，Cloudflare 会让 `https://ratinggate.cn/ws` 进入 Worker，其余页面路径继续由 Pages 处理。

## 上线验证

普通浏览器访问：

```text
https://ratinggate.cn/ws
```

应返回类似：

```json
{"ok":true,"rooms":0,"endpoint":"/ws","storage":"memory"}
```

随后验证页面功能：

- 首页可以正常打开
- 单人挑战可以加载题库并答题
- 多人模式显示“联机已连接”
- 浏览器 A 创建房间，浏览器 B 输入房间码加入
- 房主开始比赛后，两端进入同一个比赛舞台
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

本地模式仍使用 `ws://127.0.0.1:8787`，便于不依赖 Cloudflare 调试前端和房间协议。

## 常见问题

### 多人模式仍提示无法连接联机服务

检查 Pages 环境变量是否仍保留旧的 `VITE_WS_URL`。同域名方案下可删除该变量，或设置为 `wss://ratinggate.cn/ws`。

### `/ws` 返回 Pages 页面或 404

检查 Worker route 是否生效。路由应为：

```text
ratinggate.cn/ws*
```

### 修改 Worker 后没有生效

Worker 需要单独部署：

```bash
cd worker
npx wrangler deploy
```
