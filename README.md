# 私密日记 Web 应用

一个本地优先的私密日记 V1。前端在浏览器端加密日记内容，后端保存密文和必要元数据；项目提供可复现测试、生产化 Docker 构建和开源项目元文件，目标版本为 `v1.0.0`。

## 功能范围

- 登录、注册和本地预览模式
- 浏览器端 AES-GCM 加密日记正文、心情、收藏状态和图片占位数据
- 每天一篇日记的后端存储约束
- 7 天同浏览器 session 恢复
- 日记创建、编辑、收藏、软删除
- 回收站列表、恢复、永久删除
- 本地 Docker Compose 一键稳定运行

## 暂不支持

- 真实图片或附件上传；MinIO 仅作为后续附件能力预留
- 公网生产部署、HTTPS、域名和账号体系增强
- 跨设备解密同步
- 服务端明文搜索

## 架构

- `frontend/`: React + Vite + Vitest。真实模式调用 `/api`，本地预览模式不依赖后端。
- `backend/`: Go + Gin + GORM。提供认证、日记、回收站和附件元数据 API。
- `mysql`: 本地持久化数据库。
- `minio`: 后续附件能力预留对象存储。
- Docker 稳定运行时：前端由 Nginx 提供静态文件并代理 `/api` 到 `backend:8080`，后端运行已编译 Go 二进制。

## 快速开始

### Docker 稳定运行

```bash
cp .env.example .env
docker compose up --build
```

- 前端: http://localhost:5173
- 后端: http://localhost:8080
- MinIO Console: http://localhost:9001

首次启动后进入登录/注册页，也可以点击“本地预览”查看示例时间线和编辑体验。

### 本地开发

启动后端：

```bash
cd backend
go run ./cmd/api
```

启动前端：

```bash
cd frontend
npm ci
npm run dev
```

开发前端默认运行在 http://localhost:5173，并通过 Vite dev server 将 `/api` 代理到 http://localhost:8080。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改。开发环境可以使用示例值；生产环境必须设置强 `JWT_SECRET`，并将 `APP_ENV=production`。

- `APP_ENV`: `development` 或 `production`
- `API_ADDR`: 后端监听地址，默认 `:8080`
- `DATABASE_DSN`: MySQL 连接串
- `JWT_SECRET`: JWT 签名密钥；生产环境必须是 32 位以上强随机值
- `TOKEN_TTL_DAYS`: 登录 token 有效天数，默认 7 天
- `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`: 本地 MySQL 配置
- `MYSQL_PORT`: MySQL 暴露到宿主机的端口，默认 `3307`，避免与本机已有 MySQL 的 `3306` 冲突
- `MINIO_*`: 后续附件上传能力预留配置
- `VITE_API_BASE`: 前端 API 基础路径；Docker 稳定运行默认留空并使用 Nginx `/api` 代理

## 安全说明

日记正文在浏览器端加密后才发送到后端，后端只保存密文、nonce、日期和版本号等必要字段。

为了提供 7 天免登录体验，当前版本会在同一浏览器的 `localStorage` 中保存 token 和可导入的 AES key 原始材料。这个设计适合本地 MVP，但同一浏览器配置文件在 7 天内具备解密能力。不建议在共享设备或不可信设备上使用；退出登录会立即清除本地 session。

本项目的 `v1.0.0` 目标是 GitHub 稳定版，不是公网生产 SaaS 部署。公网部署前还需要补充 HTTPS、域名、密钥托管、备份、日志脱敏和更严格的账号安全策略。

## 测试与质量门禁

```bash
cd backend
go test ./...

cd ../frontend
npm ci
npm test
npm run build

cd ..
docker compose config
```

CI 会在 push 和 pull request 时运行以上质量门禁。

## 手动验收

- 打开前端首页
- 进入本地预览
- 打开日记编辑页
- 验证保存按钮、图片后续版本提示、设置菜单
- 触发删除确认并取消
- Docker 后端可用时验证注册、登录、写日记、刷新恢复、删除、回收站恢复

## Release Checklist

- `go test ./...` 通过
- `npm ci`、`npm test`、`npm run build` 通过
- `docker compose config` 通过
- Docker daemon 可用时完成 `docker compose up --build` 手动验收
- 打 `v1.0.0` tag 前确认无 `.env`、真实密钥、私有数据入库
- GitHub Actions 在 PR 或 main 分支上全部通过

## 开源协议

本项目使用 MIT License。详见 [LICENSE](./LICENSE)。
