# dsh-TrueEval

面向 DeepSeek Harness 生态的开源插件排行榜。项目持续发现并验证 GitHub 仓库，记录每日 Stars 快照，发布 Hot 100、新锐榜和完整总榜，并根据项目 README 提供中文简介。

## 功能

- **Hot 100**：综合近期增长、活跃度、项目质量和社区热度。
- **新锐榜**：按最近七天新增 Stars 排序，展示前 100 个仓库。
- **完整总榜**：按 GitHub Stars 排序，展示所有已收录仓库。
- **中文简介**：复用历史缓存，可选使用 DeepSeek API 根据 README 增量生成。
- **自动更新**：Docker 调度器默认每天北京时间 06:00 更新，周日执行完整发现。
- **可迁移数据**：SQLite、历史快照、中文缓存和公开 JSON 全部保存在 `runtime/`。

## 快速开始

需要 Docker Engine 24+ 和 Docker Compose v2。

```bash
cp .env.example .env
```

编辑 `.env`，至少填写 GitHub Token：

```env
GITHUB_TOKEN=github_pat_xxx

# 可选：为新增或 README 明显变化的仓库生成中文简介
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MAX_TOKENS=800
```

不要把 `.env` 或任何 API Key 提交到 Git。

准备初始数据并启动服务：

```bash
./scripts/prepare-runtime.sh
docker compose up -d --build web scheduler
```

打开 <http://localhost:8080>。服务状态可通过以下命令查看：

```bash
docker compose ps
docker compose logs -f web scheduler
```

## 排行规则

| 榜单 | 范围 | 排序依据 |
| --- | --- | --- |
| Hot 100 | 前 100 | 日增、七日增量、增长率、活跃度、数据质量和总热度的公开权重 |
| 新锐榜 | 前 100 | 最近七天新增 Stars 降序 |
| 总榜 | 全部 | 当前 GitHub Stars 降序 |

权重位于 [`config/ranking.json`](config/ranking.json)。第一次导入没有历史快照，因此增量为 0；每日快照积累后，新锐榜和 Hot 100 会形成真实增长数据。

## 中文简介

采集器读取仓库的 GitHub description、README、SKILL.md 和 topics。已有中文简介优先从缓存复用；配置 `DEEPSEEK_API_KEY` 后，只为新仓库、简介缺失或 README 明显变化的仓库调用模型。

模型输出会经过长度、中文字符和标记内容校验。未配置模型或调用失败时，系统会使用安全的中文兜底文案，不影响榜单更新。前端只读取生成后的公开 JSON，不接触任何密钥。

`DEEPSEEK_MODEL` 必须填写服务商控制台展示的准确模型 ID。

## 日常运维

```bash
# 手动执行一次增量采集、入库和发布
docker compose --profile manual run --rm collector

# 手动执行完整发现
DSH_DISCOVERY_MODE=full docker compose --profile manual run --rm collector

# 仅用现有采集结果重新生成数据库和榜单
npm run db:sync

# 备份 SQLite、历史快照和缓存
./scripts/backup-runtime.sh

# 停止服务
docker compose down
```

默认调度配置：

- `COLLECT_HOUR=6`：北京时间 06:00 更新。
- `FULL_DISCOVERY_WEEKDAY=0`：每周日执行完整发现，`0` 表示星期日。
- `DSH_INCREMENTAL_REPOSITORY_PAGES=2`：日常增量模式每个仓库搜索源读取的页数。
- `RUN_COLLECT_ON_STARTUP=false`：容器启动时只发布现有数据，不立即访问 GitHub。

## 部署到服务器

1. 安装 Docker Engine 与 Docker Compose。
2. 将项目复制或克隆到服务器。
3. 创建 `.env` 并填写密钥。
4. 如果是新部署，运行 `./scripts/prepare-runtime.sh`。
5. 运行 `docker compose up -d --build web scheduler`。
6. 使用 Nginx、Caddy 或云负载均衡器将域名反向代理到 `127.0.0.1:8080`，并启用 HTTPS。

迁移现有数据时，先在原机器运行 `./scripts/backup-runtime.sh`，把生成的 `backups/dsh-top100-runtime-*.tar.gz` 复制到服务器并解压到项目根目录。迁移 `runtime/` 会保留 SQLite 历史、新锐榜基线和中文简介缓存。

完整上线清单见 [`docs/deployment.md`](docs/deployment.md)。

## 公开数据

Web 服务通过 `/data/` 发布只读 JSON：

- `/data/rankings.json`：三个榜单的统一数据。
- `/data/rankings-hot.json`：Hot 100。
- `/data/rankings-rising.json`：新锐榜。
- `/data/rankings-total.json`：完整总榜。
- `/data/plugins.json`：全部公开插件字段。

SQLite、采集缓存和 `.env` 不会被 Nginx 暴露。

## 项目结构

```text
collector/          GitHub/npm 发现、插件验证、中文简介、数据库和调度器
schema/             采集器与数据发布共享的 TypeScript 类型
web/public/         无构建依赖的静态前端
config/             排行算法配置
data/               首次部署使用的种子快照
docker/             容器构建文件与 Nginx 配置
docs/               架构、排行口径、部署和历史设计文档
scripts/            运行目录初始化与备份脚本
runtime/            SQLite、每日快照、缓存和公开 JSON（不提交 Git）
```

系统结构和数据流见 [`docs/architecture.md`](docs/architecture.md)，排行细节见 [`docs/ranking.md`](docs/ranking.md)。

## 本地开发

需要 Node.js 24，推荐使用 `.nvmrc`：

```bash
nvm use
npm ci
npm run check
npm run runtime:prepare
npm run db:sync
npm run serve
```

提交修改前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。安全问题请按 [`SECURITY.md`](SECURITY.md) 中的方式报告。

## License

[MIT](LICENSE)
