# AniScore Arena

一个从零实现的 Bangumi 动画评分竞猜原型。当前版本是单人本地 MVP：玩家在两部动画中选择 Bangumi 评分更高的一部，支持经典模式、限时模式、筛选题库和本地战绩。

## 功能

- 左右卡片评分竞猜
- 经典模式：5 次机会
- 限时模式：90 秒冲分
- 投票数、年份、排名段筛选
- 排除国产、剧场版、OVA、泡面番、欧美、短片、总集篇
- 标准、近年、高手三组快捷预设
- 本地历史最佳记录
- 官方 Bangumi API 题库生成脚本
- 无头浏览器 smoke test

## 开发

```bash
npm install
npm run data:seed
npm run dev
```

本地开发地址默认为 `http://127.0.0.1:5173/`。

## 验证

```bash
npm run build
npm run test:smoke
```

`test:smoke` 会启动一个临时 Vite 服务，用本机 Chrome 跑无头浏览器测试：加载题库、点击答题、切换限时模式，并检查移动端页面可以渲染。

## 数据来源

题库由 `scripts/fetch-bangumi-seed.mjs` 通过 Bangumi API 分段抓取生成，输出到 `public/anime-seed.json`。当前题库约 6600 条动画；默认筛选会排除部分特殊类型，实际可玩池会小一些。项目没有复制第三方站点的源码、样式文件或数据文件。

## 多人联机方向

后续可以把当前游戏状态机拆成共享核心逻辑，并增加：

- WebSocket 房间连接
- 创建/加入房间
- 房主统一发题
- 同题限时作答
- 房间内排行榜
- 断线重连

免费部署方案可以优先考虑 GitHub 托管源码、Cloudflare Pages 托管前端、Cloudflare Workers + Durable Objects 承担实时房间服务。
