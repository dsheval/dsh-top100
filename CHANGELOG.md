# Changelog

本文件记录 dsh-Top100 的正式版本变化。

## 1.0.0 - 2026-08-25

首个正式稳定版本，统一发布 DSHEval 网页榜单、公开数据和 DeepSeek Harness 插件能力。

### 核心能力

- 发布 Top 100、新锐榜、总榜，以及 Agent增强、外观、编程、知识获取、工具和安全六类榜单。
- 网页端与 DSH 插件统一读取 DSHEval 服务器发布的榜单、中文简介、Stars、涨幅和分类数据。
- 提供名称、简介和标签的智能搜索，网页端与插件端保持一致的匹配策略。
- 支持在 DSH 设置页安全安装可信插件，并管理已安装 Bundle 和 Skill 的更新、启停与卸载。
- 提供 profile、加载冲突、peer 依赖、核心包版本、数据源和用户补丁的只读诊断。
- 插件内置 `recommend-dsh-plugins` Skill 和 `dsh_top100_search` 工具，可在 DSH 对话中按用户需求检索市场并推荐插件。

### 数据与兼容性

- 插件不携带 Collector、数据库或网站后端，默认从 `https://www.dsheval.ai/data` 获取公开数据。
- 安装流程支持 npm 包、GitHub 仓库及仓库子目录，并保留安装源校验和受保护包边界。
- 增加 Node.js HTTPS 证书异常时的系统网络回退，改善不同开发环境下的数据可达性。
- DSH 插件要求 `dsh web 0.1.0-rc.6+`。
