<p align="center">
  <img src="./docs/assets/dsh-top100-readme-cover.png" alt="dsh-Top100 · Verified DeepSeek Harness plugin rankings" width="100%">
</p>

<h1 align="center">dsh-Top100</h1>

<p align="center">
  <strong>发现、验证并追踪真正值得关注的 DeepSeek Harness 插件。</strong><br>
  <sub>Verified DSH plugins ranked by GitHub signals, with Skills in a separate discovery directory.</sub>
</p>

<p align="center">
  <a href="https://www.dsheval.ai"><img alt="在线体验" src="https://img.shields.io/badge/在线体验-Visit-5865f2?style=flat-square"></a>
  <a href="./CHANGELOG.md"><img alt="正式版本 v1.2.1" src="https://img.shields.io/badge/release-v1.2.1-2f6f68?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@dsheval/dsh-top100-plugin"><img alt="npm latest" src="https://img.shields.io/npm/v/%40dsheval%2Fdsh-top100-plugin?style=flat-square&label=npm&color=cb3837"></a>
  <a href="https://www.dsheval.ai/?page=dsh#dsh"><img alt="安装 dsh-Top100" src="https://img.shields.io/badge/安装指南-接入_DSH-f2b84b?style=flat-square"></a>
  <a href="./CONTRIBUTING.md"><img alt="参与贡献" src="https://img.shields.io/badge/Contribute-参与贡献-555?style=flat-square&logo=github"></a>
  <a href="https://github.com/dsheval/dsh-top100/issues/new?labels=submission&title=%5BSubmit%5D%20owner%2Frepo"><img alt="提交插件" src="https://img.shields.io/badge/提交插件-Submit-2ea44f?style=flat-square"></a>
  <a href="https://github.com/dsheval/dsh-top100/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/dsheval/dsh-top100?style=flat-square&logo=github&label=Stars"></a>
  <a href="https://www.dsheval.ai/#ranking"><img alt="收录规模以实时榜单为准" src="https://img.shields.io/badge/收录-实时更新-5865f2?style=flat-square"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/dsheval/dsh-top100?style=flat-square&label=License"></a>
  <a href="https://github.com/dsheval/dsh-top100/actions/workflows/ci.yml"><img alt="CI Status" src="https://img.shields.io/github/actions/workflow/status/dsheval/dsh-top100/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://www.dsheval.ai"><img alt="每日 06:00 自动更新" src="https://img.shields.io/badge/每日自动更新-06%3A00-2ea44f?style=flat-square"></a>
</p>

<p align="center">
  <strong>官方网站：</strong>
  <a href="https://www.dsheval.ai"><strong>https://www.dsheval.ai</strong></a>
</p>

> **dsh-Top100** is an open, verifiable discovery index for the DeepSeek Harness ecosystem. Verified DSH Plugins participate in daily GitHub-based rankings; Skills are published in a separate directory and do not affect Plugin positions or score normalization.

## DSH 插件

dsh-Top100 提供可独立安装的 DSH 插件，让用户直接在 DSH 设置页按综合热度、新锐或 Stars 浏览 Plugin，再独立选择功能分类和安装能力。Skills 使用单独的技能库，不参与 Plugin 排名。安装包自带 `recommend-dsh-plugins` Skill：当用户在 DSH 对话中询问该装哪个插件、请求插件推荐或描述想增加的能力时，模型会加载该 Skill，通过 `dsh_top100_search` 查询实时市场并给出有数据依据的推荐。

当前稳定版本为 [`@dsheval/dsh-top100-plugin@1.2.1`](https://www.npmjs.com/package/@dsheval/dsh-top100-plugin/v/1.2.1)，发布后标记为 npm `latest`。

点击下面的安装指南会打开 DSHeval 官网，并显示普通用户所需的安装、启动命令；源码运行方式和问题排查收在页面下方。这个入口不会自动下载文件，也不会自动修改电脑。

<p align="center">
  <a href="https://www.dsheval.ai/?page=dsh#dsh"><strong>打开官网安装指南（不会自动下载） →</strong></a>
</p>

用户需自行复制并运行页面中的命令。插件不包含 Collector、数据库或网页后端，榜单数据由公司服务器统一生成并通过 `www.dsheval.ai` 发布，因此插件与官方网站始终使用同一份排行和分类数据。

## 01 · 产品与榜单

dsh-Top100 是 DeepSeek Harness 公开插件生态的发现、验证和趋势索引。Plugin 排名单位是 GitHub 仓库；同一仓库即使包含多个插件子包也只占一个名次。Skills 进入独立目录。

| 榜单 | 信号 | 用途 |
| --- | --- | --- |
| **Top 100** | 日增、周增、增长率、活跃度、数据质量和总 Stars 的综合评分 | 发现当前最值得关注的 100 个 Plugin 仓库 |
| **新锐榜** | 当前 Stars 减去上一份每日快照 | 发现今日增长最快的 100 个 Plugin 仓库 |
| **Stars 总榜** | 当前 GitHub Stars 总数 | 浏览全部活跃、已验证 Plugin |
| **Skills 技能库** | 独立目录，默认按 Stars 稳定浏览 | 发现可复用的 Agent Skills；不产生 Plugin 名次 |

Agent 增强、外观、编程、知识获取、工具和安全是目录筛选条件，不是第四张榜。DeepSeek 依据 README 为每个仓库选择 1 个主分类，并增加 1–2 个有明确依据的相关分类；分类可以叠加在综合热度、新锐或 Stars 排序之上。分类结果在后端生成并保存到 SQLite，公开 JSON 同步携带分类、置信度和简短依据。模型不可用时使用可追踪的规则回退，后续任务会继续补齐智能分类。

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

## 03 · 什么仓库可以进入榜单或目录

Topic 和关键词只负责召回，不直接证明兼容性。只有通过 DSH/Cordis 结构验证的 Plugin 才能参与榜单；通过 Skill 结构验证的仓库进入独立 Skills 技能库。

| 检查 | 通过条件 | 处理方式 |
| --- | --- | --- |
| 仓库状态 | 公开、未归档、不是 fork | 不符合则排除 |
| 结构证据 | Skill 文件、Cordis/DSH 配置、package 声明或可解析插件子目录 | 按证据类型进入 Plugin 榜单或 Skills 目录 |
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
| `/data/manifest.json` | 官网使用的短缓存入口，引用同一 `snapshotId` 下的不可变榜单分片 |
| `/data/snapshots/{snapshotId}/hot.json` | 官网首屏使用的精简 Top 100 综合热度榜 |
| `/data/snapshots/{snapshotId}/rising.json` | 点击新锐榜后按需加载的精简数据 |
| `/data/snapshots/{snapshotId}/skills.json` | 独立 Skills 技能库；不参与 Plugin 排名 |
| `/data/snapshots/{snapshotId}/total/page-NNN.json` | GitHub Stars 总榜，每页 100 条 |
| `/data/snapshots/{snapshotId}/categories/{id}/page-NNN.json` | 六个 Plugin 分类筛选结果的独立 100 条分页 |
| `/data/snapshots/{snapshotId}/search.json` | 用户首次全站搜索时才加载的紧凑索引 |
| `/data/rankings.json` | 完整聚合数据、Plugin 榜单定义、分类定义和 Skills 目录 |
| `/data/rankings-hot.json` | Top 100 独立数据 |
| `/data/rankings-rising.json` | 新锐榜独立数据 |
| `/data/rankings-total.json` | Plugin Stars 总榜的完整仓库数据 |
| `/data/rankings-skills.json` | Skills 技能库兼容接口 |
| `/data/rankings-search.json` | 面向插件总榜、搜索和 Agent 推荐的紧凑索引 |

官网与当前源码插件优先消费 `manifest + snapshot 分片`；插件安装校验通过紧凑索引定位单个总榜分页。已有 `rankings*.json` 接口继续发布，供已发布的 `@dsheval/dsh-top100-plugin@1.1.0` 和其他既有消费者兼容使用。

安装目标优先选择 README 中明确指向当前仓库的 GitHub 命令；npm 命令必须与 Collector 在选中插件目录中识别的 `package.json` 包名一致，不能把前置市场或其他依赖的安装命令当作当前项目。搜索快照中的可选 `installTarget` 只保留语法白名单内的单一目标，npm 目标同时携带 `installPackageName`。缺少包名依据的旧 npm 索引只提供项目链接，重新生成快照后再按新证据展示安装入口；这不等同于代码安全审计或 npm 发布者认证。

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

## License

[MIT](./LICENSE)
