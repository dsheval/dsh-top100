# Contributing

感谢你改进 dsh-Top100。

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

## 发布版本与安装入口

每次升级插件版本，更新 `plugin/package.json`、根版本和对应锁文件记录后，运行 `npm run version:sync`。该命令以插件版本为准，同步两份 README、官网首页及安装指南的固定安装版本、等待期例外和版本标签；不改写历史兼容说明或 DSH 宿主版本。`npm run version:check` 已加入 `npm run check`，漏同步会使 CI 失败。

发布前检查安装指引，使用隔离 Profile 验证 npm 发布包的安装和实际加载版本。pnpm 的等待期由安装端决定；需要提前安装时，只对用户确认的精确版本登记 `minimumReleaseAgeExclude`，不关闭全部依赖的等待期。后续升级也要同步例外版本；已满足用户等待期的版本无需新增例外。

源码中的说明更新后，GitHub README 随合并推送更新，官网随部署更新，npm 页面 README 随后续新版本发布更新。已发布的同版本包不能覆盖；不要为更新说明重新发布相同版本。提交、推送、npm 发布与官网部署仍需用户明确授权。

## 数据源与收录

搜索命中只代表候选仓库。新增数据源不能绕过确定性插件验证，也不能仅凭 topic、仓库名称或 README 文案直接收录。
