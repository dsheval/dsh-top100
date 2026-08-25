<p align="center">
  <img src="./docs/assets/dsh-top100-readme-cover.png" alt="dsh-Top100 · Verified DeepSeek Harness plugin rankings" width="100%">
</p>

<h1 align="center">dsh-Top100</h1>

<p align="center">
  <strong>发现、验证并追踪真正值得关注的 DeepSeek Harness 插件。</strong><br>
  <sub>Verified DSH plugins, Skills and agent tools — discovered from public sources and ranked by GitHub signals.</sub>
</p>

<p align="center">
  <a href="https://dsheval.ai"><img alt="在线体验" src="https://img.shields.io/badge/在线体验-Visit-5865f2?style=flat-square"></a>
  <a href="./CONTRIBUTING.md"><img alt="参与贡献" src="https://img.shields.io/badge/Contribute-参与贡献-555?style=flat-square&logo=github"></a>
  <a href="https://github.com/dsheval/dsh-top100/issues/new?labels=submission&title=%5BSubmit%5D%20owner%2Frepo"><img alt="提交插件" src="https://img.shields.io/badge/提交插件-Submit-2ea44f?style=flat-square"></a>
  <a href="https://github.com/dsheval/dsh-top100/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/dsheval/dsh-top100?style=flat-square&logo=github&label=Stars"></a>
  <a href="https://dsheval.ai/#ranking"><img alt="已收录 3656 个仓库" src="https://img.shields.io/badge/收录-3656-5865f2?style=flat-square"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/dsheval/dsh-top100?style=flat-square&label=License"></a>
  <a href="https://github.com/dsheval/dsh-top100/actions/workflows/ci.yml"><img alt="CI Status" src="https://img.shields.io/github/actions/workflow/status/dsheval/dsh-top100/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://dsheval.ai"><img alt="每日 06:00 自动更新" src="https://img.shields.io/badge/每日自动更新-06%3A00-2ea44f?style=flat-square"></a>
</p>

<p align="center">
  <strong>官方网站：</strong>
  <a href="https://dsheval.ai"><strong>https://dsheval.ai</strong></a>
</p>

> **dsh-Top100** is an open, verifiable discovery and ranking index for the DeepSeek Harness ecosystem. It tracks public DSH plugins, DSH Skills, Cordis integrations and agent tools, then publishes daily GitHub-based rankings and reusable JSON data.

## 01 · 产品与榜单

dsh-Top100 是 DeepSeek Harness 公开插件生态的发现、验证和趋势索引。排名单位是 GitHub 仓库；同一仓库包含多个 Skill 时只计一次 Stars。

| 榜单 | 信号 | 用途 |
| --- | --- | --- |
| **Top 100** | 日增、周增、增长率、活跃度、数据质量和总 Stars 的综合评分 | 发现当前最值得关注的 100 个仓库 |
| **新锐榜** | 当前 Stars 减去上一份每日快照 | 发现今日增长最快的 100 个仓库 |
| **总榜** | 当前 GitHub Stars 总数 | 浏览全部活跃、已验证仓库 |
| **分类榜** | DeepSeek 阅读仓库 README 后生成的受控多标签分类 | 按实际能力发现同类插件；一个仓库可进入多个分类 |

分类榜包含 Agent增强、外观、编程、知识获取、工具和安全。DeepSeek 依据 README 为每个仓库选择 1 个主分类，并增加 1–2 个有明确依据的相关分类，因此每个仓库通常进入 2–3 个分类榜；分类结果在后端生成并保存到 SQLite，公开 JSON 同步携带分类、置信度和简短依据。模型不可用时使用可追踪的规则回退，后续任务会继续补齐智能分类。

新锐榜中的负增长按 `0` 处理。新部署在生成第二份每日快照后即可得到有效日增排名。

## 02 · 如何尽可能完整地发现仓库

GitHub 没有 DSH 官方全局插件注册表，因此系统采用多来源召回，再使用同一验证器过滤噪声。

```text
多来源候选 → 合并去重 → 结构验证 → README 智能分类 → SQLite 快照 → 公开榜单 JSON
```

1. **Repository Search**：搜索 DSH 名称、描述、README 与 topics。
2. **Code Search**：寻找 `SKILL.md`、DSH/Cordis 配置和依赖等强结构标记。
3. **生态来源**：补充 npm、Awesome 列表、相关组织仓库、历史目录和用户提交。
4. **递归分片**：每周完整发现按创建时间切分，必要时再按 Stars 和仓库大小切分，避免 GitHub 单次搜索 1,000 条结果上限造成静默遗漏。
5. **稳定去重**：优先使用 GitHub repository ID；同一仓库从多个来源命中时合并并保留全部来源证据。

## 03 · 什么仓库可以入榜

Topic 和关键词只负责召回，不直接证明兼容性。候选仓库必须提供可验证的 DSH 插件、Skill、Bundle 或 Cordis 集成证据。

| 检查 | 通过条件 | 处理方式 |
| --- | --- | --- |
| 仓库状态 | 公开、未归档、不是 fork | 不符合则排除 |
| 结构证据 | Skill 文件、Cordis/DSH 配置、package 依赖或可解析插件目录 | 至少命中一种强证据 |
| 数据完整性 | 仓库 ID、名称、Stars、更新时间和来源可读取 | 失败时保留上次有效数据 |
| 社区提交 | 与自动发现候选使用相同验证规则 | 提交不等于直接入榜 |

## 04 · Top 100 如何计算

Top 100 使用 100 分加权模型。榜单按内部综合分排序，但前端继续展示真实 GitHub Stars，便于理解和比较。

| 指标 | 权重 | 计算依据 |
| --- | ---: | --- |
| 当日 Stars 增长 | 35% | 当前 Stars 与上一份每日快照之差 |
| 7 日 Stars 增长 | 25% | 当前 Stars 与七日前最近快照之差 |
| 7 日增长率 | 15% | 7 日增长 ÷ 七日前 Stars；达到 30% 得满分 |
| 近期活跃度 | 10% | 按最近推送时间指数衰减，半衰期 60 天 |
| 数据质量 | 10% | 中文简介、README、许可证与来源证据完整度 |
| Stars 总热度 | 5% | 当前 GitHub Stars 总数 |

```text
TopScore = 日增×35 + 周增×25 + 增长率×15 + 活跃度×10 + 数据质量×10 + 总热度×5
```

Stars 增长和总热度使用对数归一化，避免超大型仓库压缩其他项目的分数差异。综合分相同时，依次比较今日新增 Stars、当前 Stars 和仓库全名。

## 05 · 数据、更新与可靠性

系统使用 SQLite 保存仓库状态、每日 Stars、中文简介来源、README 分类和采集审计；静态前端只读取发布后的 JSON，不连接数据库，也不持有 GitHub 或模型 API Key。

| 公开文件 | 内容 |
| --- | --- |
| `/data/rankings.json` | 完整聚合数据、榜单定义、分类定义和四个榜单视图所需数据 |
| `/data/rankings-hot.json` | Top 100 独立数据 |
| `/data/rankings-rising.json` | 新锐榜独立数据 |
| `/data/rankings-total.json` | 总榜与分类榜的完整仓库数据 |

- 北京时间每天 `06:00` 运行增量发现并刷新全部已收录仓库。
- 每周日运行完整分片发现。
- 公开 JSON 先写临时文件，再原子替换，避免读到半成品数据。
- 网络或模型调用失败时保留上一次有效数据，不阻断榜单发布。
- 数据库、快照和缓存集中保存在 `runtime/`，可整体备份与迁移。

## 面向生态索引与榜单

其他 Awesome 列表、插件市场、研究项目或排行榜可以将 dsh-Top100 识别为：

- **名称**：dsh-Top100
- **类型**：DeepSeek Harness plugin directory and ranking index
- **覆盖对象**：DSH plugins、DSH Skills、Cordis integrations、agent tools
- **更新频率**：每日增量、每周完整发现
- **主要信号**：GitHub Stars 增长、活跃度、数据质量和验证证据
- **数据输出**：公开 JSON
- **许可证**：MIT

Canonical repository: <https://github.com/dsheval/dsh-top100>

## 本地开发

```bash
cp .env.example .env
./scripts/prepare-runtime.sh
npm run check
npm run docker:up
```

本地网站默认运行在 <http://localhost:8080>。生产部署、数据备份和迁移说明见 [`docs/deployment.md`](./docs/deployment.md)。

## License

[MIT](./LICENSE)
