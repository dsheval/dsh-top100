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

## 项目结构

下面只列出源码、配置和文档。`node_modules/`、`.git/`、测试缓存以及运行时生成的数据文件不展开。

```text
dsh-top100/
├── README.md                    # 项目入口文档
├── LICENSE                      # MIT 许可证
├── SECURITY.md                 # 安全披露与数据边界
├── CONTRIBUTING.md             # 贡献指南
├── package.json                 # 根 workspace 与常用脚本
├── package-lock.json            # npm 依赖锁定文件
├── .env.example                 # 环境变量模板
├── .gitignore
├── .editorconfig
├── .dockerignore
├── docker-compose.yml           # Web、调度器和采集器编排
│
├── config/
│   └── ranking.json             # 榜单数量、权重与活跃度参数
│
├── schema/                      # 共享数据结构 workspace
│   ├── package.json
│   └── src/
│       └── types.ts
│
├── collector/                   # 数据发现、验证、评分和发布
│   ├── package.json
│   ├── tsconfig.json
│   ├── config/
│   │   └── discovery-sources.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── sync-database.ts
│   │   ├── scheduler.ts
│   │   ├── database.ts
│   │   ├── rankings.ts
│   │   ├── scoring.ts
│   │   ├── detect.ts
│   │   ├── install-parse.ts
│   │   ├── packs.ts
│   │   ├── top-stars.ts
│   │   ├── github.ts
│   │   ├── github-batch.ts
│   │   ├── llm.ts
│   │   ├── summary.ts
│   │   ├── tag-normalize.ts
│   │   ├── zh-util.ts
│   │   ├── cache.ts
│   │   ├── pool.ts
│   │   ├── env.ts
│   │   └── sources/
│   │       ├── discovery.ts
│   │       ├── github-search.ts
│   │       ├── github-code-search.ts
│   │       ├── github-partitioned-search.ts
│   │       ├── npm-search.ts
│   │       ├── awesome.ts
│   │       └── issues.ts
│   └── test/                    # Collector 的 Vitest 测试
│
├── plugin/                      # DSH 设置页排行榜与安装插件
│   ├── package.json
│   ├── cordis.patch.yml
│   ├── client/
│   │   └── client.js            # 浏览器端界面构建产物
│   └── lib/
│       ├── index.js
│       ├── routes.js
│       ├── catalog.js
│       ├── settings.js
│       ├── install-spec.js
│       ├── install-verify.js
│       ├── skill-install.js
│       ├── dsh-cli.js
│       ├── allow-builds.js
│       ├── profile.js
│       ├── http.js
│       └── *.d.ts
│
├── web/
│   └── public/
│       ├── index.html            # 静态榜单首页
│       ├── docs.html             # 站内说明内容
│       ├── top300.html           # 旧地址跳转页
│       └── assets/
│
├── docker/
│   ├── web.Dockerfile
│   ├── collector.Dockerfile
│   └── nginx.conf
│
├── scripts/
│   ├── prepare-runtime.sh
│   └── backup-runtime.sh
│
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   ├── ranking.md
│   ├── assets/
│   └── archive/
│
├── data/                         # 本地采集输出和部署种子
├── runtime/                      # SQLite、缓存和公开快照，不提交 Git
└── .github/workflows/
    └── ci.yml
```

## 文件功能

### 根目录

- `package.json`：声明 `schema`、`collector` 两个 npm workspace，并提供采集、同步数据库、调度、测试和 Docker 脚本。
- `package-lock.json`：锁定根 workspace 的 npm 依赖版本。
- `.env.example`：GitHub、DeepSeek、时区、调度时间、数据库和公开数据目录的配置模板。
- `docker-compose.yml`：编排 Nginx Web 服务、长期运行的调度器以及手动采集任务。
- `config/ranking.json`：定义 Top 100、新锐榜的数量上限、热度评分权重和活跃度半衰期。
- `SECURITY.md`：说明漏洞反馈方式、密钥管理和公开数据边界。
- `CONTRIBUTING.md`：说明开发、测试、文档同步和提交要求。

### `schema/`

- `schema/package.json`：共享类型包 `@dsh-top100/schema` 的包清单。
- `schema/src/types.ts`：定义插件、整合包、市场数据和评分等跨模块共享类型。

### `collector/`

- `collector/package.json`：Collector 的依赖和执行脚本。
- `collector/tsconfig.json`：Collector TypeScript 编译配置。
- `collector/config/discovery-sources.json`：GitHub Topic、Repository Search、Code Search 和 npm 等发现查询配置。
- `collector/src/index.ts`：采集主入口，串联发现、验证、翻译、评分和 JSON 输出。
- `collector/src/sync-database.ts`：将采集结果导入 SQLite，并原子发布公开榜单 JSON。
- `collector/src/scheduler.ts`：按北京时间周期执行采集和数据库同步。
- `collector/src/database.ts`：维护仓库当前状态、每日 Stars 快照和摘要来源记录。
- `collector/src/rankings.ts`：生成 `hot`、`rising`、`total` 榜单及稳定的公开数据结构。
- `collector/src/scoring.ts`：计算维护度、实用度、生态热度、安装便捷度和信号质量。
- `collector/src/detect.ts`：识别 Skill、Cordis/DSH 插件以及子目录中的 bundle。
- `collector/src/install-parse.ts`：从 README 安装章节提取安全、去重后的安装命令。
- `collector/src/packs.ts`：发现、解析、验证和评分 DSH 插件整合包。
- `collector/src/top-stars.ts`：独立发现高 Stars 候选，不替换主市场数据。
- `collector/src/github.ts`：封装 GitHub REST API、分页、限流等待和仓库文件读取。
- `collector/src/github-batch.ts`：通过 GitHub GraphQL 分批刷新已收录仓库。
- `collector/src/llm.ts`：调用 DeepSeek 生成中文简介，并处理异常输出和降级文案。
- `collector/src/summary.ts`：从 README 提取适合翻译和展示的摘要。
- `collector/src/tag-normalize.ts`：归一化标签并移除缺少区分度的宽泛标签。
- `collector/src/zh-util.ts`：判断 README 摘要变化幅度，决定是否重新翻译。
- `collector/src/cache.ts`：提供磁盘缓存和带 TTL 的缓存包装。
- `collector/src/pool.ts`：提供有并发上限的异步任务池。
- `collector/src/env.ts`：读取并校验 Collector 环境变量。
- `collector/src/sources/discovery.ts`：合并所有发现来源，按仓库身份去重并保留来源审计信息。
- `collector/src/sources/github-search.ts`：扫描指定 DSH 组织仓库。
- `collector/src/sources/github-code-search.ts`：通过 DSH 特征文件和依赖执行 GitHub Code Search。
- `collector/src/sources/github-partitioned-search.ts`：递归拆分 GitHub Repository Search，规避单查询 1,000 条上限。
- `collector/src/sources/npm-search.ts`：从 npm 包信息提取对应的 GitHub 仓库。
- `collector/src/sources/awesome.ts`：解析社区 Awesome 列表中的候选项目。
- `collector/src/sources/issues.ts`：读取用户提交插件或整合包的 Issue。
- `collector/test/*.test.ts`：覆盖发现、检测、数据库、GitHub 批处理、npm、LLM、整合包和中文摘要逻辑。

### `plugin/`

- `plugin/package.json`：声明 `dsh-top100-plugin` 的 Host、Client 和 Cordis bundle 导出。
- `plugin/cordis.patch.yml`：将插件注册到 DSH Cordis profile。
- `plugin/lib/index.js`：Host 入口，挂载设置项和 HTTP 路由。
- `plugin/lib/catalog.js`：拉取、缓存、搜索和过滤 `https://dsheval.ai/data` 中的榜单。
- `plugin/lib/routes.js`：提供榜单、已安装状态、批量安装、进度、取消和重试接口。
- `plugin/lib/settings.js`：注册榜单数据源设置。
- `plugin/lib/install-spec.js`：从榜单条目解析可信的 npm 或 GitHub 安装目标。
- `plugin/lib/install-verify.js`：安装前校验 `dsh.bundle`、monorepo workspace 依赖和构建要求。
- `plugin/lib/skill-install.js`：克隆并验证 Skill，只复制合法目录，不执行 README 命令。
- `plugin/lib/dsh-cli.js`：调用 `dsh plugin`，收集输出、超时和取消状态。
- `plugin/lib/allow-builds.js`：经用户确认后，为指定包写入 pnpm `allowBuilds`。
- `plugin/lib/profile.js`：读取 DSH profile 和已安装包。
- `plugin/lib/http.js`：提供 JSON 响应、请求体读取、查询参数和同源检查。
- `plugin/lib/*.d.ts`：Host 模块对应的 TypeScript 类型声明。
- `plugin/client/client.js`：在 DSH 设置页提供搜索、多选、批量安装、独立进度、取消和重试界面。

### Web、部署与文档

- `web/public/index.html`：静态排行榜主页面，读取公开 JSON 展示榜单。
- `web/public/docs.html`：供主页面加载的站内说明内容。
- `web/public/top300.html`：将旧 Top 300 地址跳转到当前排行榜。
- `web/public/assets/`：网站 Logo 和静态图片。
- `docker/web.Dockerfile`：构建静态 Nginx 网站镜像。
- `docker/collector.Dockerfile`：构建 Collector 和 Scheduler 镜像。
- `docker/nginx.conf`：配置静态站、公开数据目录和缓存策略。
- `scripts/prepare-runtime.sh`：初始化 `runtime/`，必要时从 `data/` 复制部署种子。
- `scripts/backup-runtime.sh`：停止调度后打包备份运行时数据。
- `docs/architecture.md`：说明数据流、服务边界和 `runtime/` 目录布局。
- `docs/deployment.md`：说明生产部署、迁移、更新和备份流程。
- `docs/ranking.md`：排行榜计算方式的权威说明。
- `docs/archive/`：保存已过时但仍有参考价值的历史设计文档。
- `.github/workflows/ci.yml`：执行类型检查、测试、数据库同步验证和 Docker Compose 构建。
- `data/`：本地采集产物和首次部署种子；缓存与临时报告通常被 Git 忽略。
- `runtime/`：保存 SQLite、Collector 缓存及 `rankings-*.json`、`plugins.json` 等公开快照。
