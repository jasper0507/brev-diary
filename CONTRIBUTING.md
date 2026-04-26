# Contributing

感谢你愿意改进这个私密日记项目。`v1.0.0` 的目标是稳定、可维护、可安装，而不是扩大产品范围。

## 本地开发

后端：

```bash
cd backend
go run ./cmd/api
```

前端：

```bash
cd frontend
npm ci
npm run dev
```

Docker 稳定运行：

```bash
cp .env.example .env
docker compose up --build
```

## 测试命令

提交前请运行：

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

## 提交规范

- 保持改动聚焦，一次提交解决一个主题。
- 推荐提交信息使用简短祈使句，例如 `Add CI workflow`、`Harden Docker builds`。
- 不提交 `.env`、密钥、真实日记数据、构建产物或缓存目录。
- 不在稳定版范围内引入真实图片上传、公网部署或账号体系增强，除非 issue 已明确接受。

## Pull Request 要求

- 描述改动动机和主要实现。
- 勾选 PR template 中的测试、文档和安全影响项。
- 如涉及安全边界、session、加密、认证或数据存储，请在 PR 中明确说明风险和验证方式。
- 保持 README、CHANGELOG 和相关文档与代码行为一致。
