# 目标是番组鉴分王

一个从零实现的 Bangumi 动画评分竞猜网页。当前版本是单人本地 MVP：玩家在两部动画中选择 Bangumi 评分更高的一部，支持经典模式、限时模式、筛选题库和本地战绩。

## 功能

- 左右卡片评分竞猜
- 经典模式：5 次机会
- 限时模式：90 秒冲分
- 投票数、评分范围、年份、排名段筛选
- 排除国产、剧场版、OVA、泡面番、欧美、短片、总集篇
- 标准、赤石大王、婆罗门三组快捷预设
- 自动避开两边评分相同的题目
- 限时模式点击开始后才计时
- 多人模式入口、WebSocket 创建/加入房间、房主同步设置、带封面的联机比赛舞台、经典同步赛、限时冲分赛和赛后排名
- 答对、答错、高分答案有独立视觉标识
- 本地历史最佳记录
- 页脚标注 Bangumi 数据来源、参考项目来源和数据更新时间
- `src/game-core.ts` 抽出筛选、出题、判分、预设等核心逻辑，便于后续复用到多人联机
- 官方 Bangumi API 题库生成脚本
- 无头浏览器 smoke test

## 开发

```bash
npm install
npm run data:seed
npm run dev
npm run dev:ws
```

本地开发地址默认为 `http://127.0.0.1:5173/`。多人联机需要同时运行 `npm run dev:ws`，默认房间服务地址为 `ws://127.0.0.1:8787`；如需改地址，可设置 `VITE_WS_URL`。生产环境没有设置 `VITE_WS_URL` 时会自动连接当前域名下的 `wss://<host>/ws`。

## 验证

```bash
npm run build
npm run test:smoke
npm run test:multiplayer
```

`test:smoke` 会启动一个临时 Vite 服务，用本机 Chrome 跑无头浏览器测试：加载题库、点击答题、切换限时模式，并检查移动端页面可以渲染。

`test:multiplayer` 会同时启动临时 Vite 服务和临时 WebSocket 房间服务，用两个浏览器页面验证创建房间、输入房间码加入、房主开始比赛、同步题目、双方答题和结算。

## 数据来源

题库由 `scripts/fetch-bangumi-seed.mjs` 通过 Bangumi API 分段抓取生成，输出到 `public/anime-seed.json`，更新时间输出到 `public/anime-seed-meta.json`。当前题库约 7000 条动画；标准预设使用基础题库，赤石大王只保留评分 5.0 以下作品，婆罗门偏向 2010 年以前的小众作品，三组预设都会默认排除国产、剧场版、欧美和总集篇。项目没有复制第三方站点的源码、样式文件或数据文件。

## 多人联机方向

当前本地版已经包含基础 WebSocket 房间服务，适合开发验证。后续线上化可以继续补：

- 断线重连和房间恢复
- 观战/踢人/房主转移等房间管理
- 更完整的计时模式回放和结算页
- 线上持久化排行榜

面向中国大陆用户的免费部署方案可以优先考虑 GitHub 托管源码、EdgeOne Pages 托管前端和 `node-functions/websocket.js` 承担实时房间服务。部署步骤见 [docs/deploy-edgeone.md](docs/deploy-edgeone.md)。
