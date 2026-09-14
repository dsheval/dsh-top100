# 离线批量检查中文与来源证据

`audit-description-evidence.mjs` 是独立检查入口，只写分析结果，不修改采集器、榜单或复核配置，不请求 GitHub、npm 或模型 API。它依赖现有项目的 `tsx`，不接入每日调度。

在仓库根执行：

```sh
node --import tsx scripts/audit-description-evidence.mjs \
  --inventory /absolute/path/inventory.json \
  --snapshot /absolute/path/rankings.json \
  --cache /absolute/path/cache \
  --out /absolute/path/output \
  --history /absolute/path/previous-rankings.json
```

`--history` 可重复，支持 JSON 或 gzip JSON。输入 inventory 为离线分流清单 `{rows:[...]}`，每行包含 fullName、description、readmeSummary、packageName、repositoryPath、offlineGroup、rank、sourceHash。snapshot 为完整榜单 `rankings.total`；二者身份或作者资料不符时停止，不按旧清单强行继续。

缓存目录使用现有 `detect/`、`roots/`、`readmes/` 格式。检测记录须匹配当前冻结行的 pushedAt、包名、目录、类型以及检测/文档/安装解析策略；只匹配旧 discovery.sourceRevision 不足以复用。README 必须按仓库、所选目录、版本和目录证据中的分支找到，并且重新生成摘要与冻结摘要、检测摘要匹配。不能退回根 README，也不猜 main/master。日期一致是现有缓存策略的依据，不等于固定 commit 的实时源码核验。

输出：

- `reuse.json`：精确功能来源或白名单发行文案变化的旧中文候选；排除原描述照搬、原描述片段、冲突文本和不完整中文。
- `writing.json`：包级资料已绑定并提取到功能段，等待内容复核与补写。提取使用启发式，不是功能语义验收。
- `identity.json`：根运行时、已标识的依赖对象，保留可用的其他路径线索；不自动删条目或切换包。
- `exceptions.json`：证据缺失、固定暂停、身份变化、维护状态及其他未决事项。
- `results.json`、`summary.json`：完整结果和输入/证据/策略文件 SHA-256。
- `fetch-plan.json`：后续缺失证据清单，`enabled:false`，不具有联网执行权限。

四个队列互斥。全部结果均 `requiresReviewBeforeApply:true`。历史检测记录复用不是新做结构验证，更不是安装、宿主兼容或功能实机验收。固定暂停与撤回优先；仅泛化的“摘要未出现包名/路径”门槛可由精确 README 来源证据满足，且仅用于候选分流，不修改线上规则。

验证：

```sh
node --import tsx --test scripts/test/audit-description-evidence.test.mjs
```

测试覆盖跨包/跨目录与旧版本拒绝、固定撤回、根包和依赖隔离、README 分支冲突、历史内容污染、发行文案比较、停止维护、离线集成及输入不变。
