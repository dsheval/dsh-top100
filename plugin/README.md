# dsh-Top100 DSH 插件

把线上 dsh-Top100 榜单嵌进 DeepSeek Harness Web 的设置页：浏览 Top 100 / 新锐 / 总榜 / 分类榜，搜索全部已收录插件，并对有可信安装源的条目一键或批量安装。

需要 **dsh web 0.1.0-rc.6+**。本机开发按官方手册的 bundle 安装方式挂载。

## 安装

发布后：

```sh
dsh plugin --profile web add dsh-top100-plugin
```

本地开发（官方 `link:` 方式）：

```sh
npm run build -w dsh-top100-plugin
dsh plugin --profile web add link:D:/dsh-top100/plugin
```

然后重启 `dsh web`，打开 **设置 → 插件排行**。

## 数据源

Host 端读取：

```text
https://www.dsheval.ai/data/rankings.json
```

分类榜与网页版共用该文件中的 `categories` 和每个条目的 `categories` 字段。目前受控分类为 Agent增强、外观、编程、知识获取、工具和安全；线上名称、说明和数量更新后，插件会随榜单数据同步。

可用环境变量或插件配置覆盖：

```sh
DSH_TOP100_DATA_URL=http://127.0.0.1:8080/data dsh web
```

```yaml
- id: dsh-top100
  name: dsh-top100-plugin
  config:
    dataUrl: https://www.dsheval.ai/data
    profile: web
```

## 安装边界

- 浏览器不直连榜单域名，由 Host 拉取。
- 安装入口只接受目录里的 `owner/repo`，再解析成 npm 包名或 `github:owner/repo`。
- 不执行 README 里的安装命令。
- Cordis 插件写入当前 profile；Skill 克隆后只复制合法目录到 `~/.dsh/skills`。
- 同一 profile 的 `pnpm add` 串行执行；Skill 下载最多 3 路并发。
- 安装接口只接受同源 POST。

## 开发

```sh
npm run typecheck -w dsh-top100-plugin
npm run test -w dsh-top100-plugin
npm run build -w dsh-top100-plugin
dsh web --dump-config
```

源码按职责拆分：`src/host` 负责 DSH 接入和 HTTP API，`src/install` 负责受控安装，`src/client` 负责设置页界面，`src/shared` 只放两端共享的数据契约。

组成符合官方双端插件手册：`apply` + `Config` schema + `dsh.bundle.patch` + `exports["./client"]`。
