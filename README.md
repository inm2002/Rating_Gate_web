# Rating;Gate

基于 Bangumi 动画条目的评分竞猜网页。玩家在两部动画中判断评分更高的一部，支持单人挑战、题库筛选、本地战绩和多人实时房间。

项目参考 [目标是Bangumi大师](https://bangumi-master.logicry.cc/) 的玩法创意，并感谢原项目提供的灵感。本项目未复制原项目源码、样式文件或数据文件，主要在同类评分竞猜玩法基础上重新实现页面、题库处理和游戏逻辑，并扩展了多人联机模式。

## 功能

- 左右卡片评分竞猜
- 经典模式：5 次机会
- 限时模式：90 秒冲分
- 投票数、评分范围、年份、排名段筛选
- 排除国产、剧场版、OVA、泡面番、欧美、短片、总集篇
- 标准、赤石大王、婆罗门三组筛选预设
- 自动避开两侧评分相同的题目
- 限时模式确认开始后再启动计时
- 多人房间：创建/加入房间、房主同步设置、联机比赛舞台、经典同步赛、限时冲分赛、赛后排名
- 答对、答错、高分答案的独立视觉标识
- 本地历史最佳记录
- 页脚标注 Bangumi 数据来源、参考项目来源和数据更新时间
- Bangumi API 题库生成脚本
- 无头浏览器 smoke test 和多人联机回归测试

## 技术结构

- 前端：Vite + TypeScript
- 单人核心逻辑：`src/game-core.ts`
- 本地 WebSocket 房间服务：`scripts/ws-room-server.mjs`
- Cloudflare Worker + Durable Object 联机服务：`worker/src/index.ts`
- 题库数据：`public/anime-seed.json`

## 本地开发

安装依赖：

```bash
npm install
```

如需重新生成题库：

```bash
npm run data:seed
```

启动前端开发服务：

```bash
npm run dev
```

启动本地联机房间服务：

```bash
npm run dev:ws
```

默认访问地址为 `http://127.0.0.1:5173/`。本地多人联机默认连接 `ws://127.0.0.1:8787`。

生产环境未显式设置 `VITE_WS_URL` 时，前端会连接当前域名下的 `wss://<host>/ws`。

## 验证

```bash
npm run build
npm run test:smoke
npm run test:multiplayer
```

`test:smoke` 会启动临时 Vite 服务，并通过无头浏览器验证单人玩法、筛选、限时模式和移动端渲染。

`test:multiplayer` 会同时启动临时 Vite 服务和临时 WebSocket 房间服务，并通过两个浏览器页面验证创建房间、加入房间、同步题目、双方答题、结算、排名弹窗和返回大厅。

## 数据来源

题库由 `scripts/fetch-bangumi-seed.mjs` 通过 Bangumi API 分段抓取生成，输出到 `public/anime-seed.json`，更新时间输出到 `public/anime-seed-meta.json`。

当前题库约 7000 条动画。标准预设使用基础题库；赤石大王只保留评分 5.0 以下作品；婆罗门偏向 2010 年以前的小众作品。三组预设都会默认排除国产、剧场版、欧美和总集篇。

参考来源为 [目标是Bangumi大师](https://bangumi-master.logicry.cc/)，感谢其创意。

## 部署

部署方案使用 Cloudflare Pages 托管前端，并通过 Cloudflare Workers + Durable Objects 提供 `ratinggate.cn/ws` 实时房间服务。前端页面和多人联机共用 `ratinggate.cn`。

部署步骤见 [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md)。
