# Security Policy

## 报告安全问题

请不要在公开 Issue 中提交 API Key、访问令牌、服务器地址、数据库文件或可利用的漏洞细节。公开托管后，优先使用 GitHub Security Advisories 的私密报告功能联系维护者。

报告应包含受影响版本、复现条件、潜在影响和建议修复方式，但不得包含真实生产密钥。

## 密钥与数据

- GitHub 和 DeepSeek 密钥只存放在未提交的 `.env` 中。
- 前端和 Nginx 只读取 `runtime/public-data/`。
- SQLite、采集缓存、原始运行数据和备份不得公开托管。
- 怀疑密钥泄漏时，应立即在服务商控制台撤销并重新生成，而不是仅从 Git 历史删除。
