# 私密日记 Web 应用

本仓库是一个本地 Docker Compose 可运行的私密日记 MVP。

## 运行

```bash
docker compose up --build
```

- 前端: http://localhost:5173
- 后端: http://localhost:8080
- MinIO Console: http://localhost:9001

前端启动后会先进入登录/注册页。可以连接后端注册账号，也可以点“本地预览”直接查看当前的时间线与编辑体验。

## 本地验证

```bash
cd backend
go test ./...

cd ../frontend
npm test
npm run build
```

## 当前完成范围

- 登录/注册入口和本地预览入口
- 安静纸感时间线首页
- 每天一篇日记的后端约束
- 软删除、回收站列表、恢复、永久删除 API
- 前端保存前心情必选
