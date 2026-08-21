# DSH 仓库发现 AI 开发文档

> 版本：1.0
> 状态：本轮实施基线
> 日期：2026-08-21
> 范围：候选仓库发现、覆盖审计与 collector 接入；不包含前端

## 1. 目标

本功能尽可能完整地发现 GitHub 上公开、可被验证为 DSH 插件、Skill 或 Bundle 的候选仓库，并为每条候选保存可审计的发现来源。

“完整”限定为至少暴露一个可搜索信号的公开仓库。私有仓库，以及名称、README、topic、代码、包元数据和社区入口均未出现 DSH 信号的仓库，不属于可证明召回的范围。

本轮完成后，现有 collector 继续负责确定性结构检测、元数据补全、评分与中文化；前端仍消费原有 `plugins.json`，不做页面改造。

## 2. 冻结决策

1. topic、README、代码搜索、npm 和人工清单只产生候选，不直接证明它是真插件。
2. GitHub Repository Search 不再使用 `stars/updated/created` 各取前 1,000 条的近似并集。
3. Repository Search 使用 `created:` 时间范围递归分片；单秒仍超限时依次使用 `stars:` 与 `size:` 桶继续分片。
4. 单个可分页分片最多允许 900 条结果，为索引变化保留余量。
5. 任一 Repository Search 分片持续返回 `incomplete_results=true`，或者无法继续拆分，完整扫描必须失败，不能把截断结果描述为完整结果。
6. GitHub Code Search 用于发现强结构标记。全局代码查询无法可靠按仓库创建时间分片；查询超过安全阈值时读取可访问窗口并明确标记 `partial`，不能把它描述为完整代码搜索。
7. npm 是补充来源。npm 搜索索引不提供依赖反查全集，因此其审计状态允许是 `partial`，不能计入 GitHub 完整性门禁。
8. 去重优先使用 GitHub repository `node_id`，缺失时使用数值 `id`，最后才使用规范化 `owner/repo`。
9. 每条候选保留所有命中来源，例如 `github-topic:dsh-plugin`、`github-code:cordis-patch`、`npm:deepseek-harness`。
10. 本轮不接入匿名安装遥测、不创建前端榜单、不改变现有排名口径。

## 3. 数据源

### 3.1 GitHub Repository Search

硬来源：

- `topic:dsh-plugin`
- `topic:deepseek-harness-plugin`
- `topic:dsh-bundle`
- `topic:dsh-skill`

补充查询：

- `"deepseek harness" in:name,description,readme`
- `"deepseek-harness" in:name,description,readme`
- `"dsh plugin" in:name,description,readme`
- `"@deepseek-ai/dsh-" in:readme`

裸 `topic:dsh` 噪声过高，不再作为默认来源。

### 3.2 GitHub Code Search

- `filename:cordis.patch.yml`
- `filename:dsh.profile OR filename:dsh.profile.yml`
- `"@deepseek-ai/dsh-" filename:package.json`
- `"deepseek-harness" filename:SKILL.md`

Code Search 返回的仓库仍进入统一检测流程；命中文件名不直接获得收录资格。

### 3.3 npm

搜索 `deepseek-harness`、`dsh-plugin` 和 `dsh-skill`，从包元数据的 GitHub repository 链接提取候选仓库。搜索失败不得阻断 GitHub 硬来源，但必须写入审计报告。

### 3.4 既有来源

继续保留：

- `dsh-external` 组织
- awesome 清单
- submission Issue
- 上次成功快照的延续性确认

## 4. Repository Search 分片算法

```text
scan(baseQuery, createdFrom, createdTo):
  probe = search(baseQuery + created:from..to, per_page=1)
  require probe.incomplete_results == false

  if probe.total_count <= 900:
    paginate every page
    require collected identities >= probed total_count
    return results

  if created range spans more than one second:
    split at midpoint
    return scan(left) union scan(right)

  for every stars bucket:
    scan(baseQuery + created:range + stars:bucket)

  if a stars bucket still exceeds 900:
    split it by size bucket

  if a final bucket still exceeds 900:
    fail as unshardable
```

Stars 桶固定为：`0`、`1..5`、`6..20`、`21..100`、`101..1000`、`>1000`。

Size 桶固定为：`0..10`、`11..100`、`101..1000`、`1001..10000`、`10001..100000`、`>100000`，单位为 GitHub Search 的 KB。

时间范围使用 UTC 秒，左右分片不重叠。所有页面再次检查 `incomplete_results`。搜索索引在分页期间变化导致结果少于 probe 数量时，该分片重试；重复失败后完整扫描失败。

## 5. 运行模式

### 5.1 full

默认模式。运行所有配置的 Repository Search 分片、Code Search、npm 和既有来源。当前每日工作流继续使用此模式，确保功能接入后不依赖尚未实现的游标状态。

### 5.2 incremental

分片器支持给基础查询附加 `pushed:>=...` 条件，供后续每日增量工作流使用。本轮不把生产工作流切到 incremental，因为切换前必须先实现已收录仓库的批量元数据刷新与可靠删除确认。

## 6. 审计协议

collector 的 `report.json` 新增 `discovery`：

```ts
interface DiscoveryAudit {
  mode: "full" | "incremental";
  complete: boolean;
  startedAt: string;
  completedAt: string;
  sources: Array<{
    id: string;
    kind: "repository" | "code" | "npm";
    status: "complete" | "partial" | "failed";
    candidates: number;
    requests: number;
    shards?: number;
    message?: string;
  }>;
}
```

控制台同时打印每个来源的候选数和分片数。报告不得把 npm 的 `partial` 计为 GitHub 扫描失败。

## 7. 文件实施

新增：

- `collector/config/discovery-sources.json`
- `collector/src/sources/github-partitioned-search.ts`
- `collector/src/sources/github-code-search.ts`
- `collector/src/sources/npm-search.ts`
- `collector/src/sources/discovery.ts`
- 对应单元测试

修改：

- `collector/src/github.ts`：补充 `node_id`、`incomplete_results` 与 Code Search 类型。
- `collector/src/index.ts`：使用统一 discovery 结果并把审计写入报告。
- `collector/src/sources/github-search.ts`：只保留组织扫描兼容入口。

## 8. 失败策略

- Repository Search 语义不完整：抛错并终止 collector。
- Repository Search 无法拆分到 900 条以下：抛错并终止 collector。
- Code Search 超过 900 条：读取可访问窗口并标记 `partial`；持续 incomplete 或请求失败则标记 `failed`，保留 Repository Search 主流程。
- npm 超时、格式变化或达到最大页数：标记 `partial`，继续 GitHub 主流程。
- 单个候选后续结构检测失败：沿用现有 rejected 报告，不影响其他候选。
- 任何失败日志都不得包含 token。

## 9. 验收标准

1. 1001 条 Repository Search fixture 经时间分片后全部返回且无重复。
2. 单秒超限 fixture 能使用 Stars 桶继续拆分。
3. `incomplete_results=true` 重试耗尽后明确失败。
4. 分页收集少于 probe 总数时明确失败。
5. Code Search 能按仓库身份去重并保留多个来源。
6. npm 能解析 HTTPS、`git+https`、`git://`、`ssh://git@github.com` 与 `github:owner/repo` 链接。
7. 统一 discovery 对同一仓库合并全部来源。
8. 现有 collector 测试全部通过。
9. TypeScript 类型检查通过。
10. 不修改 `web/`，不要求前端消费新字段。

## 10. 后续阶段

1. 使用 GitHub App 与 GraphQL 批量刷新已收录仓库元数据。
2. 保存成功游标，把每日工作流切为 48 小时重叠的 incremental；每周保留 full。
3. 增加标准 `dsh.plugin.json` 和 `dsh plugin publish` 官方登记通道。
4. 增加可选匿名安装事件，发现市场外真实安装来源。
5. 在历史快照稳定后生成 1/7/30 日增长指标，再由前端接入趋势榜。
