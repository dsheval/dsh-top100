# 1.3.0 本地发布验收记录

核查日期：2026-09-03。候选包为 `@dsheval/dsh-top100-plugin@1.3.0`，尚未发布。

本文件记录候选进入 PR 前完成的本地验收；后续 Git 和远端 CI 进展以对应 PR 的检查记录为准。

本地准备、包验证与真实 DSH Web 隔离验收已通过；Docker 构建和远端发布门槛仍未完成，不能将此记录视为正式发布批准。npm 插件发布本身不依赖本机 Docker，镜像构建可交由 PR 的 GitHub Actions 验证，容器运行验收留到测试/部署环境。

## 候选范围

- 全库相关度搜索、中文同义词和查询缓存，搜索/分类/安装源筛选叠加，插件切换分类保留搜索词。
- Collector、官网和插件共用安装源解析；支持官方 npx、profile 参数、引号、HTTPS GitHub 地址与 ref，保留来源身份校验及危险命令拒绝规则。
- README 安装命令提取、中文简介质量检查和保守兜底；“知识”分类名称统一，紧凑索引可选 `needsConfig` 保持旧快照兼容。
- 已完成的官网、插件市场和安装确认界面；安装指南、GitHub/npm README、三张真实界面截图；本轮没有重做 UI 或图片。
- Collector 镜像复制共享安装解析模块，安装解析缓存版本更新为 2。

详见 [CHANGELOG](../CHANGELOG.md#130---待发布)。根包与插件、锁文件中的对应记录均为 `1.3.0`；官网首页、安装指南及 OG 图中的文本版本已同步。Collector `0.1.0`、schema `0.1.1` 沿用独立版本，不做单独发包。

本次发版准备额外修复了路由测试缓存污染：每个测试使用独立磁盘缓存并恢复环境变量，避免重复执行时缓存命中跳过模拟网络请求。已同步官网测试中的版本断言。

## 验证结果

| 检查 | 结果与边界 |
| --- | --- |
| `npm run check` | Node 26.8.1：所有 workspace 类型检查通过；Collector 110、插件 209、网页 55，共 374 项测试通过，无失败或跳过。 |
| 隔离 `npm ci` + `npm run check` | Node 24.20.0、npm 11.19.0：从锁文件安装成功，同样通过 374 项测试；锁文件未被安装过程改写。Node 主版本与 CI 一致，但并非 Ubuntu CI 实跑。 |
| `npm run plugin:build` | 本地成功，生成 `plugin/lib` 与 `plugin/client/client.js`。 |
| 生成产物比对 | 本地 Node 26 构建与 Node 24 隔离构建的 56 个主端、客户端和网站共享模块文件逐字节一致。三张截图与任务开始时 SHA-256 一致。 |
| 路由缓存修复复核 | 使用同一外层缓存目录重复运行路由测试，9 项通过；包含在上述 209 项中，不重复计数。 |
| `npm pack -w @dsheval/dsh-top100-plugin` | 实际执行 prepack 构建并生成 `.tgz`，未跳过脚本；清单、版本与归档内容核对通过。 |
| 隔离 npm 包安装 | 从实际 `.tgz` 安装成功，正常解析依赖，无 `--legacy-peer-deps`；`npm ls --depth=1` 退出 0。此最小安装未自动安装可选的 DSH settings peer，另由下述完整宿主验收覆盖。 |
| 已安装包加载 | 主端导入成功；客户端包通过 ModuleLoader/设置 slot 接口烟测；在真实 Cordis、SkillRegistry、SystemPrompt、ToolRuntime 中注册内置 Skill 和工具成功。客户端仅验证加载与注册，未挂载完整浏览器页面。 |
| 已安装包读取快照 | 使用隔离发布的本地文件模拟只读数据接口，成功读取 3,322 个 Plugin 和 92 个 Skill，中文“浏览器”搜索返回结果。未安装任何榜单项目、未发起外部请求、未写入现用 DSH profile。 |
| 官方 DSH CLI 安装 | 在临时目录安装 npm 已发布的 `@deepseek-ai/dsh@0.1.1-rc.2`，通过其 `dsh plugin --profile web add file:<候选包.tgz>` 安装 1.3.0，确认 profile 依赖、bundle 注册和已安装产物正确。使用 Node 24.20.0 / pnpm 11.24.0，宿主所需安装脚本仅在临时安装目录按包允许执行。 |
| 真实 DSH Web 界面 | 独立 `DSH_HOME`、本地快照服务、`127.0.0.1` 自动分配端口、`--no-open`。设置页出现 Rankings；首屏 40/100 Plugin，搜索“浏览器”返回全库 1,058 条结果，切换“知识”保留搜索词，叠加安装源筛选后为 159 条，独立 Skills 为 92 条。已安装列表显示 1.3.0；诊断错误、警告、加载冲突和依赖问题均为 0，浏览器无 error/warn 日志。没有配置 API Key、运行对话或安装第三方榜单项目。 |
| `npm run runtime:prepare` + `npm run db:sync` | 仅在临时仓库副本执行，使用 `.env.example`、空密钥且模型分类批量为 0；3,414 条样本导入新 SQLite，发布 3,322 个 Plugin、92 个 Skill、热度/新锐各 100 条、总榜 34 页。118 个不可变快照引用的 JSON、字节数和 SHA-256 独立核对通过。未运行采集。 |
| `docker compose config --quiet` | 临时副本使用模板环境文件检查通过，未读取现用 `.env`。 |
| `docker compose build web scheduler` | 尝试失败：Docker daemon 的 socket 不存在。未构建或运行容器，未重启现有预览服务。 |
| `git diff --check` | 通过。 |

所有临时安装、仓库副本、脚本、日志及候选包保存在 `/private/tmp/dsh-top100-1.3.0-l9rvd_ko/`，未纳入 Git。原仓库的 `.env`、`runtime/` 与用户 DSH 配置未用于这些发布测试。初次检查暴露的旧版本断言和重复运行缓存问题均已修复，上表列的是修复后的结果。

真实 Web 验收在沙箱中启动时遇到文件监听 `EMFILE`，经宿主执行权限审核后使用相同临时 profile 重试成功；没有改写 DSH 或插件代码绕过监听。临时宿主与数据服务均已停止，浏览器验收页已关闭，已有预览服务未重启。截图与具体证据保留为 `host-market.png`、`host-diagnostics-dom.txt`、`host-verification.json` 及 `logs/dsh-*.log`。

## npm 包

文件：`dsheval-dsh-top100-plugin-1.3.0.tgz`，58 个文件，压缩 104,638 字节，展开 435,550 字节。

包含主端 JS/类型、浏览器包、bundle patch、推荐 Skill、package.json 和 npm README。归档内容与隔离构建逐文件一致；不含截图、Collector、测试、源码目录、数据库、`.env` 或 runtime。

SHA-256：`6e802d07ccb11145a875b8ae60d668eb10d8a19bcb89d105412ed6940fda35f7`。

这是未提交工作树的本地验证包。正式发布须从审核并合入后的确定版本重新生成、验证和记录摘要，不能直接把此临时包当作已批准发布产物。

## CI 核查

现有 `.github/workflows/ci.yml` 在 push/PR 时使用 Ubuntu 与 Node 24，依次执行 `npm ci`、`npm run check`、模板环境准备及 `runtime:prepare`/`db:sync`、Docker Compose 配置检查、`web`/`scheduler` 镜像构建。Collector Dockerfile 已包含新共享解析源文件，其 COPY 路径存在且未被 `.dockerignore` 排除。

本轮未改 CI。当前 CI 没有显式执行插件构建、npm 打包/安装烟测或 npm 正式发布；上述包检查为本地补充验证，合并前仍应执行。本地验收时，尚无此候选改动的远端 CI 结果；进入 PR 后须检查对应提交的 CI，不能引用稳定基线的结果代替。

## 未完成门槛与已知限制

1. Docker daemon 不可用：Linux 镜像构建、真实 Web 容器中的页面验收、容器内 scheduler 发布链路未验证。
2. 已完成 macOS / Node 24.20.0 / DSH 0.1.1-rc.2 的真实 CLI 安装及 Web 设置页验收；最低 Node 22.13、最低 DSH Web 0.1.0-rc.6、Desktop/Windows 仍未验证。未进行第三方项目真实安装。
3. 本地验收时 npm `latest` 重新核查为 `1.2.1`，远端 `main` 与 `v1.2.1` 一致。官网 `1.3.0` 是待部署内容，不能据此认为 registry 已更新；后续 Git 状态以对应 PR 为准。
4. npm README 使用 GitHub `main` 的三张绝对截图 URL，本轮均返回 HTTP 404：`dsh-plugin-market.png`、`dsh-website-preview.jpg`、`dsh-install-confirm.png`。三张本地资产必须先合入 main，随后确认 URL 返回正确图片，再发布 npm。
5. 线上效果尚未验证。新简介与安装源证据依赖部署新版 Collector 后的正常采集及快照发布，解析缓存版本 2 会使旧缓存逐步重建，下一轮可能增加请求量。不清库、不删 runtime、不强制采集或回填。
6. 沿用已经确认的 UI 取舍：青绿按钮白字对比度约 2.92:1；390px 下 DSH 宿主固定侧栏仍限制插件可用宽度。本任务没有改变这些设计，也没有将其标为已修复。

## 下一阶段顺序

1. 本地包和独立 DSH 宿主验收已通过，可进入 GitHub 阶段，无需先在本机启动 Docker。
2. 用户明确授权后，检查全部差异和未跟踪源文件/截图，再 commit、push、创建 PR；让 GitHub Actions 验证 Linux Docker 镜像构建，代码审查和当前候选的 CI 通过后，经授权合并 main。容器运行验收在具备 Docker 的测试/部署环境补齐，不能把构建成功等同于运行验收。
3. 复核 main 三张图片可访问；从合并后的确定版本重建并验证 npm 包，将 CHANGELOG“待发布”更新为实际日期。
4. 用户明确授权 tag/npm publish 后再执行，核查 registry 版本、README、图片与安装结果。
5. 服务器部署另行明确授权与目标、备份、健康检查和回滚版本；升级 web 与 scheduler，等待正常采集，验证新快照效果。

候选开发分支为 `feat/discovery-quality-search`，PR 目标为 `main`。本记录不授权合并、打 tag、npm publish 或部署；这些操作仍须分别取得明确授权。
