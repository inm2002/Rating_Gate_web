# EdgeOne Pages 免费部署指南

这套部署方式适合先做免费上线验证，并尽量照顾中国大陆用户访问体验。

## 架构

```text
GitHub 仓库
  -> EdgeOne Pages 自动构建
  -> dist 静态前端
  -> node-functions/websocket.js 提供 /ws 联机服务
```

前端在生产环境没有设置 `VITE_WS_URL` 时，会默认连接当前域名下的 `wss://<host>/ws`。本地开发仍默认连接 `ws://127.0.0.1:8787`。

## 本地确认

```bash
npm install
npm run build
npm run test:smoke
npm run test:multiplayer
```

本地联机开发需要同时运行：

```bash
npm run dev
npm run dev:ws
```

## 推送到 GitHub

如果还没有远端仓库：

```bash
git remote add origin <你的 GitHub 仓库地址>
git push -u origin master
```

如果已经配置过远端：

```bash
git push
```

## EdgeOne Pages 设置

1. 打开 EdgeOne Pages 控制台。
2. 新建 Pages 项目，选择从 GitHub 导入仓库。
3. 构建配置填写：

```text
Framework preset: Vite
Build command: npm ci && npm run build
Output directory: dist
Install command: npm ci
```

4. 环境变量一般可以不填，因为生产环境会自动使用：

```text
wss://<你的 Pages 域名>/ws
```

如果你想显式指定，也可以添加：

```text
VITE_WS_URL=wss://<你的 Pages 域名>/ws
```

5. 部署完成后，打开 Pages 提供的访问地址。

## 验证清单

- 首页可以打开
- 单人挑战可以加载题库并答题
- 多人模式显示“联机已连接”
- 浏览器 A 创建房间，浏览器 B 输入房间码加入
- 房主开始比赛后，两边进入同一个比赛舞台
- 经典同步赛中，一方作答后卡片出现选中高亮
- 双方作答后出现排名弹窗
- 点击“回到大厅”后双方同步回到大厅

## 备案说明

先使用 EdgeOne Pages 默认域名可以快速测试。后续如果绑定自己的域名并希望使用中国大陆加速/大陆节点，通常需要先完成 ICP 备案。正式运营前建议准备备案和自有域名。

## 常见问题

### 多人模式一直显示联机未连接

检查 Pages 部署后 `/ws` 是否可访问。普通浏览器打开 `https://<域名>/ws` 应该返回 JSON 或提示需要 WebSocket 升级，而不是 404。

### 本地能联机，云端不能联机

优先检查 EdgeOne Pages 是否识别了 `node-functions/websocket.js`。如果你的项目设置了自定义根目录，确保 `node-functions` 位于部署根目录下。

### 修改联机服务后本地没生效

Vite 只会热更新前端。修改 `scripts/ws-room-server.mjs` 或 `node-functions/websocket.js` 后，需要重启：

```bash
npm run dev:ws
```
