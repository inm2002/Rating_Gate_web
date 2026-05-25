# Cloudflare 部署指南

本文档说明如何使用 Cloudflare Pages、Cloudflare Workers 和 Durable Objects 部署 Rating;Gate。前端、多人联机和匿名统计后台可以共用同一个域名。

## 架构

```text
example.com
  /             -> Cloudflare Pages 前端
  /ws*          -> Cloudflare Worker
                   -> Durable Object 内存房间状态
  /api/*        -> Cloudflare Worker
                   -> Durable Object 匿名聚合统计
```

生产环境未配置 `VITE_WS_URL` 时，前端默认连接当前域名下的 `wss://<host>/ws`。若站点部署在 `https://ratinggate.cn`，多人联机服务会默认使用 `wss://ratinggate.cn/ws`。

动画、漫画、轻小说和 Galgame 题库通过 GitHub Actions 在北京时间每周一 00:00 自动重新生成并提交到仓库。Cloudflare Pages 连接 GitHub 仓库后，会在数据提交后触发一次前端部署。

## 计量优化

- 服务端不做逐秒倒计时广播。
- 限时模式开始时只广播 `startAt` 和 `durationMs`。
- 前端根据 `startAt + durationMs` 本地渲染倒计时。
- 房间状态保存在 Durable Object 内存中，房间无人后立即清理。
- 匿名统计只在用户同意后于赛后提交一次，服务端只保存聚合桶和题目组合聚合计数。
- 匿名统计弹窗会记录展示、同意和拒绝的聚合计数，用于估算统计样本来源和同意率。
- 不维护服务器端持久排行榜，只在当局结算时广播房间内排名。
- 经典模式只在玩家作答、结算、进入下一题等状态变化时广播。
- 限时模式只在玩家作答和比赛结束时广播。

## 新部署

### 1. 准备仓库

将项目推送到 GitHub，并确认仓库中包含：

```text
dist 不提交
public/*-seed.json
public/*-seed-meta.json
worker/wrangler.toml
worker/src/index.ts
```

`.env*` 和 `.dev.vars*` 已在 `.gitignore` 中排除。生产密钥应只放在 Cloudflare Secret 中。

### 2. 创建 Cloudflare Pages 前端

在 Cloudflare 控制台进入 **Workers & Pages**，选择 **Create application**，创建 Pages 项目并连接 GitHub 仓库。

构建配置：

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

Pages 只负责前端静态资源，Deploy command 保持为空，不要在 Pages 的 Deploy command 中运行 `npx wrangler deploy`。

同域名部署时通常不需要配置前端环境变量。若需要显式指定 Worker 地址，可在 Pages 的环境变量中设置：

```text
VITE_WS_URL=wss://<站点域名>/ws
VITE_API_BASE_URL=https://<站点域名>
```

同域名方案下可以不设置这两个变量，前端会使用当前域名。

### 3. 绑定自定义域名

在 Pages 项目中进入 **Custom domains**，添加域名，例如：

```text
ratinggate.cn
```

等待 Cloudflare 自动配置 DNS 和证书。绑定成功后，普通页面路径仍由 Pages 处理。

### 4. 创建并部署 Worker

Worker 代码位于 `worker/`。命令行部署：

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

`worker/wrangler.toml` 默认包含：

```text
ratinggate.cn/ws*
ratinggate.cn/api/*
```

如果使用其他域名，需要同步修改 `worker/wrangler.toml` 中的 `routes`。

### 5. 配置后台密钥

统计后台需要 Worker Secret `ADMIN_TOKEN`。它不会进入仓库，也不会出现在前端构建产物中。

命令行配置：

```bash
cd worker
npx wrangler secret put ADMIN_TOKEN
```

也可以在 Cloudflare 控制台进入对应 Worker，打开 **Settings** -> **Variables and Secrets**，添加 Secret：

```text
Name: ADMIN_TOKEN
Value: 使用密码管理器生成的长随机字符串
```

建议使用 32 位以上随机字符串，并定期更换。

### 6. 确认 Worker 路由

在 Cloudflare 控制台进入对应 Worker，打开 **Settings** -> **Domains & Routes**，确认存在：

```text
ratinggate.cn/ws*
ratinggate.cn/api/*
```

这两个路径由 Worker 处理，其余页面路径继续由 Pages 处理。

### 7. 访问统计后台

后台入口：

```text
https://<站点域名>/#admin
```

页面会要求输入 `ADMIN_TOKEN`，并通过 `Authorization: Bearer <token>` 请求 `/api/admin/analytics`。接口只返回聚合统计，不返回单局原始记录。

后台页面不包含生产密钥；生产密钥只保存在 Cloudflare Worker Secret 中。后台接口会校验 `ADMIN_TOKEN`，连续错误请求过多时短时间返回 `429`。

## 从旧部署升级

如果已经部署过只包含多人联机的旧版本，升级到包含匿名统计后台的版本时需要额外做以下操作：

1. 拉取或推送最新代码到 GitHub。
2. 等待 Cloudflare Pages 自动重新部署前端，或在 Pages 项目页面手动点击 **Retry deployment** / **Create deployment**。
3. 重新部署 Worker：

```bash
npm run worker:deploy
```

4. 确认 Worker route 从旧的 `/api/results*` 扩展为：

```text
ratinggate.cn/api/*
```

5. 配置 Worker Secret：

```bash
cd worker
npx wrangler secret put ADMIN_TOKEN
```

6. 打开 `https://<站点域名>/#admin`，输入 `ADMIN_TOKEN` 验证后台。

如果旧版本已经在同一个 Durable Object 类中产生匿名统计，升级后会继续读取原有 `distribution` 和 `pair` 聚合数据。新版会额外记录 `consent` 弹窗展示、同意和拒绝计数，并提供后台查询接口。

## 通过 Cloudflare 控制台部署 Worker

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

后台接口验证：

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" https://<站点域名>/api/admin/analytics
```

返回值中应包含 `games`、`pairs` 和 `consent` 三类聚合信息。

匿名统计接口可以用 `POST /api/results` 验证。该接口只接受用户同意后的赛后统计请求，真实数据不会写入仓库。

随后验证页面功能：

- 首页可以正常打开。
- 单人挑战可以切换动画、漫画、轻小说和 Galgame 题库并答题。
- 漫画与轻小说的媒体专属筛选可正常收窄题池。
- Galgame 全年龄/非全年龄排除标签可用，非全年龄条目使用标题封面。
- 多人模式显示“联机已连接”。
- 浏览器 A 创建房间，浏览器 B 输入房间码加入。
- 房主开始比赛后，两端进入同一个比赛舞台。
- 房主切换题库后，其他玩家看到同步后的题库设置。
- 经典同步赛中，一方作答后卡片出现选中高亮。
- 双方作答后出现排名弹窗。
- 点击“回到大厅”后双方同步回到大厅。
- 打开 `/#admin`，输入后台密钥后可以看到聚合图表。

## 本地开发

前端：

```bash
npm run dev
```

本地 WebSocket 服务：

```bash
npm run dev:ws
```

需要本地测试统计后台时，可以启动 Worker：

```bash
cd worker
npx wrangler dev --ip 127.0.0.1 --port 8787 --local --var ADMIN_TOKEN:test-admin-token --var SEED_BASE_URL:http://127.0.0.1:5173
```

然后访问：

```text
http://127.0.0.1:5173/#admin
```

输入 `test-admin-token` 查看本地聚合统计。

## 常见问题

### 多人模式提示无法连接联机服务

检查 Pages 环境变量中的 `VITE_WS_URL` 是否指向正确的 Worker 地址。同域名方案下可以不设置该变量，或设置为 `wss://<站点域名>/ws`。

### `/ws` 返回 Pages 页面或 404

检查 Worker route 是否生效。使用 `ratinggate.cn` 时，路由应包含：

```text
ratinggate.cn/ws*
```

### 后台提示无法连接统计接口

检查 Worker route 是否包含：

```text
ratinggate.cn/api/*
```

如果只有旧的 `ratinggate.cn/api/results*`，后台查询接口不会被 Worker 接管。

### 后台提示密钥不正确

确认输入的是 Worker Secret `ADMIN_TOKEN` 的值，而不是 Cloudflare API Token。连续输错多次后接口会临时限流，等待提示中的时间后再试。

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
