# dsh-Top100 本地开发交接

更新时间：2026-08-25

## 1. 交接目标

后续开发应在 `/Users/hcy/Desktop/dsh-top100` 工作区进行。本交接只描述本地测试版本；云服务器、域名、Caddy、SSL 和线上数据库操作继续放在单独的服务器任务中处理。

当前前端已经达到可继续迭代的状态。开始新任务时必须保留现有工作树，禁止使用 `git reset --hard`、`git checkout -- web/public/index.html`、`git clean` 或其他会覆盖未提交文件的命令。

## 2. 新任务开始方式

在 Codex 中打开 `/Users/hcy/Desktop/dsh-top100` 作为工作区，然后先执行只读检查：

```bash
pwd
git status --short
git log -3 --oneline --decorate
docker compose ps
```

期望工作目录：

```text
/Users/hcy/Desktop/dsh-top100
```

可直接把下面这段作为新任务的第一条消息：

> 请先阅读 `docs/HANDOFF.md`，保留当前所有未提交改动。本任务只开发 `/Users/hcy/Desktop/dsh-top100` 的本地测试版本，不连接或修改云服务器。修改前先检查 `git status`，不要 reset、checkout 或清理现有前端文件。

## 3. 当前 Git 状态

正式稳定基线为 `main` 分支的最新正式标签，当前发布目标为 `v1.0.1`，远端为：

```text
origin  https://github.com/dsheval/dsh-top100.git
```

维护时以远端 `main` 和正式标签为准，不在交接文档中记录容易过期的提交哈希或工作树清单。开始修改前先执行 `git status --short` 和 `git log -3 --oneline --decorate`；已有改动默认属于正在进行的工作，除非用户明确要求，不要删除、回退或批量格式化。

## 4. 当前可用功能

### 首页与视觉

- 产品名为 `dsh-Top100`。
- 首页保留绿色、黄色和米白色视觉体系。
- Hero 区包含 `Top 100`、`接入 DSH`、`Docs`、带 Logo 的 `GitHub` 和 `DSHeval` 按钮。
- `接入 DSH` 会切换到完整的插件介绍、安装、使用、数据安全和排查页面。
- `DSHeval` 按钮直接打开 `https://www.dsheval.ai/dsheval`。
- `GitHub` 直达 `https://github.com/dsheval/dsh-top100`。
- 榜单背景使用两个交错圆形及轻量动画；支持 `prefers-reduced-motion`。
- 榜单滚动进入视口时按从上到下的顺序显示动画。

### Docs 同页切换

- 点击首页 `Docs` 不打开新页面，而是在榜单区域原位切换为文档内容。
- Docs 状态 URL 为 `/?page=docs#docs`，返回榜单后为 `/#ranking`。
- Docs 内有“返回榜单”按钮，浏览器前进、后退和刷新可以恢复当前视图。
- `web/public/docs.html` 是文档内容源；`index.html` 读取其中的 `.docs-layout` 并嵌入首页，因此不要复制出第二套文档正文。
- 独立访问 `/docs.html` 仍可作为直接文档地址和同页加载失败时的内容源。
- `web/public/dsh.html` 和 `web/public/dsheval.html` 是同页加载的内容片段；前者为接入说明，后者用于承接后续 DSHeval 页面材料。
- DSH 插件随包提供 `recommend-dsh-plugins` Skill，并注册 `dsh_top100_search` 只读模型工具；对话中的插件推荐直接查询同一份实时榜单和共享智能搜索逻辑。
- DSH 插件设置页增加「插件市场 / 已安装 / 诊断」三层导航；分类仍统一使用 Agent增强、外观、编程、知识获取、工具、安全，管理操作通过同源 Host API 和 profile 串行队列执行。

### 榜单

- `Top 100`：按综合热度评分排序，但列表展示真实 GitHub Stars。
- `新锐榜`：按今日新增 Stars 排序。
- `总榜`：展示全部已验证仓库，按 Stars 总数排序。
- 支持搜索、隐藏 Skill 仓库和总榜分页加载。
- 仓库名称本身不可点击；GitHub 圆形按钮负责打开仓库。
- GitHub 按钮旁有复制按钮，用于复制仓库 `.git` 下载地址。
- Star 标签已经修复为整行垂直居中；中文简介一行或两行时不应再偏上。
- 移动端使用两行卡片布局，桌面端使用表格式 Top 100 布局。

## 5. 前端关键文件

```text
web/public/index.html       首页、榜单、多内容页切换、全部样式和前端逻辑
web/public/docs.html        最新 Docs 正文内容源及独立文档页面
web/public/dsh.html         接入 DSH 页面正文
web/public/dsheval.html     DSHeval 页面占位正文
web/public/data/            镜像构建时的静态数据目录
runtime/public-data/        Docker Web 容器实际只读挂载的公开榜单 JSON
docker/nginx.conf           静态站点与 /data 路由
docker/web.Dockerfile       Nginx Web 镜像
```

当前 `index.html` 是单文件静态应用，没有 React/Vue 构建链。修改时优先延续现有 HTML、CSS 和原生 JavaScript 结构，不要在一个小改动中擅自迁移框架。

## 6. 数据与数据库现状

当前使用 SQLite：

```text
runtime/dsh-top100.sqlite
```

当前本地状态：

- 数据库大小约 15 MB。
- `repositories`：3,414 条。
- `repository_daily_stats`：3,414 条。
- 最新快照日期：2026-08-21。
- `runtime/public-data/rankings.json` 生成时间：2026-08-21 17:27（北京时间）。
- Top 100：100 条。
- 新锐榜：100 条。
- 总榜：3,414 条。

主要表：

| 表 | 用途 |
| --- | --- |
| `repositories` | 仓库最新元数据、Stars、状态和发现来源 |
| `repository_daily_stats` | 每日 Stars、Forks 和 Issues 快照 |
| `repository_summaries` | 中文简介、来源哈希、模型和提示版本 |
| `collection_runs` | 采集执行状态、数量与错误审计 |

所有可迁移状态集中在 `runtime/`。迁移或备份时必须保持 SQLite 与公开 JSON 一致，优先使用 `./scripts/backup-runtime.sh`。

## 7. 数据更新链路

```text
GitHub / npm / Awesome / 社区线索
  → 候选发现
  → 确定性结构验证
  → 可选 DeepSeek 中文简介
  → SQLite 最新状态与每日快照
  → 排名计算
  → 原子发布 JSON
  → Nginx 静态前端
```

默认更新策略：

- 北京时间每天 06:00：增量发现并刷新已收录仓库。
- 每周日：完整分片发现。
- Scheduler 启动时默认只重新发布已有数据库快照，不立即访问 GitHub；`RUN_COLLECT_ON_STARTUP=true` 才会启动即抓取。

排名规则详见 `docs/ranking.md`。当前 Top 100 权重为：日增 35%、周增 25%、7 日增长率 15%、活跃度 10%、数据质量 10%、Stars 总量 5%。

## 8. 环境变量与密钥

配置模板位于 `.env.example`，本地真实密钥位于根目录 `.env`。不要读取、输出或提交 `.env`。

主要变量：

```text
GITHUB_TOKEN
DEEPSEEK_API_KEY
DEEPSEEK_API_BASE
DEEPSEEK_MODEL=deepseek-v4-flash
WEB_PORT=8080
COLLECT_HOUR=6
FULL_DISCOVERY_WEEKDAY=0
RUN_COLLECT_ON_STARTUP=false
DSH_DISCOVERY_MODE=incremental
```

前端永远不接触 GitHub Token、DeepSeek API Key 或 SQLite，只读取 `/data/*.json`。

## 9. 本地启动与验证

只构建前端：

```bash
docker compose up -d --build web
```

启动前端和每日调度器：

```bash
docker compose up -d --build web scheduler
```

当前本地服务：

```text
Web        http://localhost:8080
Docs 视图 http://localhost:8080/?page=docs#docs
榜单视图 http://localhost:8080/#ranking
```

基础检查：

```bash
docker compose ps
curl --fail http://127.0.0.1:8080/
curl --fail http://127.0.0.1:8080/data/rankings.json
npm run typecheck
npm test
git diff --check
```

前端改动必须在真实 Docker Web 容器中验证，至少检查：

1. 首页首屏和桌面宽度布局。
2. Docs 点击后 URL 仍是 `/`，只增加 `?page=docs#docs`。
3. Docs 的“返回榜单”能够恢复 `/#ranking`。
4. Top 100、新锐榜、总榜切换正常。
5. 中文简介一行和两行时 Star 标签均处于榜单行垂直中心。
6. 搜索、隐藏 Skill 和复制 `.git` 地址正常。
7. 小屏幕没有横向溢出。

浏览器可能缓存单文件 HTML。若 Docker 重建后仍看到旧样式，可以先使用带临时查询参数的地址验证，例如 `http://localhost:8080/?dev=1#ranking`，但不要把该参数写入代码。

## 10. 常用命令

```bash
# 类型检查和测试
npm run check

# 使用现有配置执行一次采集并同步数据库
npm run update:once

# 手动 Docker 采集器
docker compose --profile manual run --rm collector

# 查看日志
docker compose logs --tail=200 web scheduler

# 备份 runtime
npm run runtime:backup

# 停止服务
docker compose down
```

运行采集会访问 GitHub，并可能调用 DeepSeek API。仅做前端开发时不要执行 `update:once` 或手动 collector。

## 11. 当前未完成与建议优先级

1. 根据 DSHeval 正式页面的后续变化维护外部入口与接入说明。
2. Docs 后续可补充单仓库排名解释、历史 Stars 曲线和项目提交入口。
3. 需要决定哪些 Logo 草稿保留；未得到用户确认前不要删除任何图片。
4. 当前多内容页前端改动尚未提交；提交前应先让用户确认最终页面。
5. 服务器版本与本地版本可能不同。任何上线、数据迁移、Caddy 或 SSL 操作都必须转到服务器专用任务，并在操作前重新检查线上状态。

## 12. 交接边界

- 本地开发任务可以修改 `/Users/hcy/Desktop/dsh-top100`。
- 不要修改 `/Users/hcy/Desktop/deepseek-harness` 来实现 dsh-Top100 功能。
- 不要 SSH 到 `47.238.229.20`，除非用户在服务器专用任务中明确授权。
- 不要自动推送 GitHub；只有用户明确要求时才提交和推送。
- 不要把 `.env`、SQLite、`runtime/`、备份文件或 API Key 加入 Git。
