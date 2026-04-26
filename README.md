# 私密日记 Web 应用

这是一个本地 Docker Compose 可运行的私密日记 V1。应用支持注册登录、浏览器端加密保存日记、7 天同浏览器会话恢复、软删除、回收站恢复和永久删除。

## 功能范围

- 登录、注册和本地预览模式
- 每天一篇日记的真实后端存储约束
- 浏览器端 AES-GCM 加密日记正文、心情、收藏状态和图片占位数据
- 7 天同浏览器 session 恢复
- 日记创建、编辑、收藏、软删除
- 回收站列表、恢复、永久删除
- 本地 Docker Compose 一键启动

## 暂不支持

- 真实图片/附件上传：当前“添加图片”是 V1 后续能力提示
- 跨设备同步解密体验
- 公网生产部署、HTTPS、域名和正式账号体系增强
- 服务端明文搜索

## 运行

```bash
docker compose up --build
```

- 前端: http://localhost:5173
- 后端: http://localhost:8080
- MinIO Console: http://localhost:9001

首次启动后进入登录/注册页。也可以点击“本地预览”查看示例时间线和编辑体验。

## 环境变量

复制 `.env.example` 为 `.env` 后按需修改。开发环境可以使用示例值；生产环境必须设置强 `JWT_SECRET`，并将 `APP_ENV=production`。

关键变量：

- `APP_ENV`: `development` 或 `production`
- `JWT_SECRET`: JWT 签名密钥，生产环境必须改成 32 位以上强随机值
- `TOKEN_TTL_DAYS`: 登录 token 有效天数，默认 7 天
- `DATABASE_DSN`: MySQL 连接串
- `MINIO_*`: 预留给后续附件上传能力

## 安全说明

日记正文在浏览器端加密后才发送到后端，后端只保存密文、nonce、日期和版本号。

为了提供 7 天免登录体验，当前版本会在同一浏览器的 `localStorage` 中保存 token 和可导入的 AES key 原始材料。这个设计适合本地 MVP，但它意味着同一浏览器配置文件在 7 天内拥有解密能力。请避免在不可信设备上使用，退出登录会立即清除本地 session。

## 本地验证

```bash
cd backend
go test ./...

cd ../frontend
npm test
npm run build
```

## V1 交付清单

- 后端 JWT 限制 HS256 签名算法
- 生产模式拒绝默认弱 `JWT_SECRET`
- 日记日期校验为合法 `YYYY-MM-DD`
- 前端预览模式不调用后端 API
- 前端真实模式完成日记创建、编辑、删除、回收站闭环
- 删除和永久删除使用应用内确认弹窗
- 加载/保存错误显示状态且保留草稿
