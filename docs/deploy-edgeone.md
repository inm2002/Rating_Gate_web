# EdgeOne Pages 部署指南

本文档说明如何将项目部署到 EdgeOne Pages，并启用多人联机所需的 WebSocket 房间服务。

## 架构

```text
GitHub 仓库
  -> EdgeOne Pages 自动构建
  -> dist 静态前端
  -> node-functions/websocket.js 提供 /ws 联机服务
```

生产环境未配置 `VITE_WS_URL` 时，前端默认连接当前域名下的 `wss://<host>/ws`。本地开发环境默认连接 `ws://127.0.0.1:8787`。

## 部署前检查

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

首次配置远端仓库：

```bash
git remote add origin <GitHub 仓库地址>
git push -u origin master
```

后续更新：

```bash
git push
```

## EdgeOne Pages 配置

1. 在 EdgeOne Pages 控制台新建 Pages 项目。
2. 选择从 GitHub 导入仓库。
3. 使用以下构建配置：

```text
Framework preset: Vite
Install command: npm ci
Build command: npm ci && npm run build
Output directory: dist
```

4. 环境变量通常无需配置。生产环境会默认使用：

```text
wss://<Pages 域名>/ws
```

如需显式指定联机服务地址，可添加：

```text
VITE_WS_URL=wss://<Pages 域名>/ws
```

5. 部署完成后访问 Pages 提供的域名。

## 上线验证

- 首页可以正常打开
- 单人挑战可以加载题库并答题
- 多人模式显示“联机已连接”
- 浏览器 A 创建房间，浏览器 B 输入房间码加入
- 房主开始比赛后，两端进入同一个比赛舞台
- 经典同步赛中，一方作答后卡片出现选中高亮
- 双方作答后出现排名弹窗
- 点击“回到大厅”后双方同步回到大厅

## 备案说明

EdgeOne Pages 默认域名可用于快速验证。若后续绑定自有域名，并希望使用中国大陆加速或大陆节点，通常需要先完成 ICP 备案。

## 常见问题

### 多人模式一直显示联机未连接

检查部署后的 `/ws` 路径是否可访问。普通浏览器打开 `https://<域名>/ws` 时，应返回 JSON 或提示需要 WebSocket 升级，而不是 404。

### 本地能联机，云端不能联机

优先检查 EdgeOne Pages 是否识别了 `node-functions/websocket.js`。若项目配置了自定义根目录，需要确保 `node-functions` 位于部署根目录下。

### 修改联机服务后本地没有生效

Vite 只会热更新前端。修改 `scripts/ws-room-server.mjs` 或 `node-functions/websocket.js` 后，需要重启本地房间服务：

```bash
npm run dev:ws
```
