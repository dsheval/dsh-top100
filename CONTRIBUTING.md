# Contributing

感谢你改进 dsh-TrueEval。

## 开发流程

1. 从主分支创建功能分支。
2. 使用 Node.js 24 和 `npm ci` 安装依赖。
3. 修改采集器行为时补充或更新 `collector/test/` 中的测试。
4. 修改排行口径时同步更新 `docs/ranking.md`。
5. 修改部署、环境变量或持久化目录时同步更新 README 和 `docs/deployment.md`。
6. 提交前运行 `npm run check`。

## Pull Request 要求

- 一次 PR 解决一个清晰问题。
- 描述用户可见变化、数据兼容性和验证方式。
- 不提交 `.env`、API Key、`runtime/`、备份文件或本机缓存。
- 前端变化应附带截图；排行变化应提供可复现的测试。

## 数据源与收录

搜索命中只代表候选仓库。新增数据源不能绕过确定性插件验证，也不能仅凭 topic、仓库名称或 README 文案直接收录。
