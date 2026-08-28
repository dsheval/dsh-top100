# dsh-Top100 DSH 插件

把线上 dsh-Top100 榜单嵌进 DeepSeek Harness Web 的设置页：浏览 Top 100 / 新锐 / 总榜 / 分类榜，搜索全部已收录插件，并对作者明确提供且验证通过的安装源进行单项确认安装。设置页同时提供已安装插件与 Skill 的状态、更新、启停和卸载入口，以及只读的 profile、加载冲突、peer 依赖、榜单数据源和用户补丁诊断。插件还自带 `recommend-dsh-plugins` Skill；用户在 DSH 对话中询问“该装哪个插件”或描述所需能力时，模型会加载该 Skill，并通过 `dsh_top100_search` 查询实时榜单后给出推荐。

**[一键下载并查看接入 DSH 指南](https://www.dsheval.ai/?page=dsh#dsh)**

当前正式版本：**v1.0.1**。

需要 **dsh web 0.1.0-rc.6+**。本机开发按官方手册的 bundle 安装方式挂载。

## 安装 dsh-Top100

安装插件和启动 DSH 必须使用相同的命令前缀。

### npm/npx 普通用户（默认）

请在 DSH 源码仓库外运行：

```sh
npx @deepseek-ai/dsh plugin --profile web add @dsheval/dsh-top100-plugin
npx @deepseek-ai/dsh web
```

### 从 DSH 源码运行

请把路径替换为本机 DSH 源码仓库的实际绝对路径，并在仓库根目录执行后续命令：

```sh
cd /path/to/deepseek-harness
pnpm dsh plugin --profile web add @dsheval/dsh-top100-plugin
pnpm dsh web
```

### 已有全局 CLI

如果 `dsh --version` 可以正常返回，也可以直接使用：

```sh
dsh plugin --profile web add @dsheval/dsh-top100-plugin
dsh web
```

安装后打开 **设置 → 插件排行**。

部分 npm 环境可能在首次解析 DSH 依赖时长时间无输出并持续占用 CPU。该问题发生在 DSH npm 发布包的依赖解析阶段，并非 dsh-Top100 插件安装失败。如果 `npx @deepseek-ai/dsh --version` 也无法完成，请停止命令并改用源码方式。不要单独添加 `--legacy-peer-deps`，否则可能漏装 DSH 运行时依赖。参见 [DSH 上游讨论](https://github.com/deepseek-ai/deepseek-harness/discussions/3786)。

### 本地插件开发

本地开发继续使用官方 `link:` 方式：

```sh
npm run build -w @dsheval/dsh-top100-plugin
dsh plugin --profile web add link:D:/dsh-top100/plugin
```

页面包含：

- **插件市场**：Top 100、新锐、总榜及 Agent增强 / 外观 / 编程 / 知识获取 / 工具 / 安全六类榜单。
- **已安装**：管理当前 profile 的社区 Bundle 和本地 Skill；官方包、排行插件自身及 `link:` / `file:` 源会按安全边界限制操作。
- **诊断**：只读扫描当前 profile 的加载顺序、重复行、peer 依赖、核心包多版本、榜单可达性和用户补丁层。

在 DSH 对话中可以直接询问：

```text
推荐几个适合做浏览器自动化的 DSH 插件
我需要长期记忆能力，应该安装哪个插件？
```

推荐 Skill 和搜索工具随插件注册，不会复制或覆盖用户自己的 `~/.dsh/skills` 文件；卸载插件后也会一起移除。

## 数据源

Host 端读取 DSHeval 的同一份榜单快照。Top 100 和新锐首屏优先读取较小的分片：

```text
https://www.dsheval.ai/data/rankings-hot.json
https://www.dsheval.ai/data/rankings-rising.json
https://www.dsheval.ai/data/rankings.json
```

总榜、分类和全库搜索按需读取完整文件。成功响应会缓存在 `$DSH_HOME/cache/dsh-top100/`；缓存过期后先返回上一次有效榜单，再在后台刷新，因此短时网络波动不会阻塞已缓存页面。相同数据请求会自动合并，避免并发重复下载。

分类榜与网页版共用该文件中的 `categories` 和每个条目的 `categories` 字段。目前受控分类为 Agent增强、外观、编程、知识获取、工具和安全；线上名称、说明和数量更新后，插件会随榜单数据同步。

插件市场展示的排名、Stars、涨幅、中文简介、标签和分类全部来自 DSHEval 服务器发布的这份文件，浏览器端不会另外请求 GitHub 生成或补写榜单数据。GitHub 仅用于用户主动打开项目，以及确认安装后验证安装源并交给 DSH 安装。

可用环境变量或插件配置覆盖：

```sh
DSH_TOP100_DATA_URL=http://127.0.0.1:8080/data dsh web
```

```yaml
- id: dsh-top100
  name: '@dsheval/dsh-top100-plugin'
  config:
    dataUrl: https://www.dsheval.ai/data
    profile: web
```

## 安装边界

- 浏览器不直连榜单域名，由 Host 拉取。
- 设置页确认安装只对作者明确提供、且验证通过的 `dsh plugin add` 目标开放；其他条目保持只读浏览。
- 不执行 README 里的安装命令。
- npm 目标支持 `@latest` 和精确版本；验证遇到 404、GitHub 限流或缺失 `dsh.bundle` 时立即停止，不再猜测其他来源。
- GitHub 验证会复用 `GITHUB_TOKEN` 或 `GH_TOKEN`（如已配置）并缓存成功结果；没有 Token 时受 GitHub 匿名额度限制。
- Cordis 插件写入当前 profile；Skill 克隆后只复制合法目录到 `~/.dsh/skills`。
- 同一 profile 的 `pnpm add` 串行执行；Skill 下载最多 3 路并发。
- 安装前后都会执行 DSH profile 配置检查；新插件导致检查失败时尝试自动移除该插件。
- 安装接口只接受同源 POST。
- 启停只写当前 profile 的用户 `cordis.patch.yml`，不修改第三方插件文件。
- 更新和卸载复用同一 profile 串行队列；受保护包不能从页面修改。

## 开发

```sh
npm run typecheck -w @dsheval/dsh-top100-plugin
npm run test -w @dsheval/dsh-top100-plugin
npm run build -w @dsheval/dsh-top100-plugin
dsh web --dump-config
```

源码按职责拆分：`src/host` 负责 DSH 接入、HTTP API、推荐 Skill 和模型搜索工具，`src/install` 负责受控安装，`src/client` 负责设置页界面，`src/shared` 只放两端共享的数据契约。Skill 原文位于 `skills/recommend-dsh-plugins/SKILL.md`，发布包会保留该目录。

组成符合官方双端插件手册：`apply` + `Config` schema + `dsh.bundle.patch` + `exports["./client"]`。
