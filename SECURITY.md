# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `v1.0.x` | Yes |
| `< v1.0.0` | No |

## Reporting a Vulnerability

请不要在公开 issue 中披露可利用的安全细节。当前仓库公开后，请通过 GitHub Security Advisory 私下报告；如果仓库尚未启用 advisory，请联系维护者指定的私密渠道。

报告中请尽量包含：

- 受影响版本或 commit
- 复现步骤
- 影响范围
- 你认为可行的修复方向

维护者会在确认后尽快回复，并在修复发布前避免公开可利用细节。

## Current Security Boundary

本项目 `v1.0.0` 是本地优先的 GitHub 稳定版，不是公网生产 SaaS。

日记正文在浏览器端加密后才发送到后端。为了支持 7 天同浏览器 session，前端会在 `localStorage` 保存 token 和可导入的 AES key 原始材料；这意味着同一浏览器配置文件在 7 天内具备解密能力。

请不要在共享设备、不可信设备或多人共用浏览器配置文件中使用当前版本。退出登录会清除本地 session。

公网部署前需要额外完成 HTTPS、域名、密钥托管、备份、访问控制、日志脱敏和更严格的账号安全策略。
