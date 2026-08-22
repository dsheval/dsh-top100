<p align="center">
  <img src="./docs/assets/dsh-top100-readme-cover.png" alt="dsh-Top100 · True popularity. Readable at a glance." width="100%">
</p>

<p align="center">
  <a href="http://47.238.229.20"><strong>访问 dsh-Top100 网站</strong></a>
</p>

## 网站

**dsh-Top100** 用于发现、验证和追踪 DeepSeek Harness 生态中的 GitHub 插件仓库。网站每天更新仓库 Stars、中文简介和排行榜。

访问地址：<http://47.238.229.20>

## 榜单

| 榜单 | 范围 | 排序方式 |
| --- | --- | --- |
| **Top 100** | 当前最值得关注的 100 个仓库 | 按综合评分排序，页面展示真实 GitHub Stars |
| **新锐榜** | 当日增长最快的 100 个仓库 | 今日新增 Stars 降序 |
| **总榜** | 全部已验证仓库 | 当前 GitHub Stars 总数降序 |

新锐榜使用上一份每日快照作为基线；新部署在生成第二份每日快照后即可得到有效排名。

## 爬取规则

1. **多来源召回**：使用 GitHub Repository Search、GitHub Code Search、npm 搜索、社区 Awesome 列表、DSH 组织仓库和用户提交线索寻找候选项目。
2. **关键词与结构搜索**：检索 `dsh-plugin`、`deepseek-harness-plugin`、`dsh-skill` 等 topics，以及 `SKILL.md`、`dsh.profile`、`cordis.patch.yml` 和 `@deepseek-ai/dsh-*` 依赖。
3. **结构验证**：排除 fork 和 archived 仓库；候选仓库必须存在 DSH Skill、Cordis/DSH 配置文件，或能够从 `package.json` 中确认 DSH/Cordis 依赖与声明。子目录中的插件也会被识别。
4. **合并去重**：同一仓库从多个来源命中时只保留一条记录，并保存全部发现来源；社区提交的项目使用相同验证规则，不直接入榜。
5. **每日增量**：默认北京时间每天 06:00 扫描近期有更新的高价值候选，同时刷新所有已收录仓库的 Stars、活跃状态和基础信息。
6. **每周全量**：每周日执行完整发现。GitHub Repository Search 按创建时间递归分片，必要时继续按 Stars 和仓库大小切分，避免直接受单次搜索 1,000 条结果上限影响。
7. **历史记录**：每次成功采集后写入 SQLite 和每日 Stars 快照，用于计算日增量与 7 日增量。

## Top 100 评分规则

| 指标 | 权重 | 计算依据 |
| --- | ---: | --- |
| 当日 Stars 增长 | 35% | 当前 Stars 与上一份快照的差值 |
| 7 日 Stars 增长 | 25% | 当前 Stars 与七日前最近快照的差值 |
| 7 日增长率 | 15% | 7 日增量 ÷ 七日前 Stars；达到 30% 时获得该项满分 |
| 近期活跃度 | 10% | 根据最近推送时间衰减，半衰期为 60 天 |
| 数据质量 | 10% | 中文简介、README 摘要、许可证和有效发现证据的完整度 |
| Stars 总热度 | 5% | 当前 GitHub Stars |

增长量和 Stars 总热度使用对数归一化，避免超大型仓库压缩其他项目的分数差异。负增长按 0 计算；综合得分相同时，依次比较当日新增 Stars、Stars 总数和仓库名称。
