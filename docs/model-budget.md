# Scoped Flash trials and model budget

The default model is `deepseek-flash` (DeepSeek V4.1 Flash, verified against the official September 10, 2026 release). Real transport only accepts this model, explicit non-thinking mode, at most 256 output tokens, text-only messages, and the official Chat Completions endpoint. An environment or CLI model override cannot authorize a different model.

Paid requests remain disabled by default. Enabling `DSH_MODEL_REQUESTS_ENABLED=1` also requires a credential and an explicitly approved private `DSH_MODEL_BUDGET_CONFIG` file. That file must be outside the repository, owned by the process user, permission `0600`, and not a symlink. Its required fields are:

- `schemaVersion: 1`, `approval: "approved"`, `protectionVersion: "model-budget-v1"`;
- `projectId: "dsh-top100"`, `model: "deepseek-flash"`, a unique `batchId`, and `approvedRequestHashes` containing the SHA256 of each exact serialized request body;
- explicit `dailyLimitCny`, `monthlyLimitCny`, and `batchLimitCny`, capped at 5, 50, and 1 respectively;
- `price.version`, `price.verifiedAt`, `price.validUntil`, and `peak` / `offPeak` rates with `inputHitCnyPerMillion`, `inputMissCnyPerMillion`, `outputCnyPerMillion`. A verified price may be valid for at most seven days. Real requests require at least 45 seconds of validity remaining.

Do not place secrets in an approved request list, prompt, source tree, image, log, or command argument. Prefer `DEEPSEEK_API_KEY_FILE` pointing at an absolute, owner-only `0600` file outside the repository and mount it read-only at runtime. The file takes precedence; an invalid file clears any old environment key and refuses to load. All root and nested `.env` variants are excluded from Docker build context. The checked-in `.env.example` contains no credential.

## Shared accounting

All entry points use the same `runtime/model-budget.sqlite`, relative to the application root. It must remain on the existing persistent runtime mount across images and batch runs; do not run paid workers against independent copies on multiple hosts. The ledger does not cover another application using the same API key.

SQLite `BEGIN IMMEDIATE` atomically reserves peak, cache-miss input cost plus maximum output cost before transport. Amounts are integer nano-CNY; concurrent in-flight requests across processes are capped at three. Input reservation uses full request UTF-8 bytes plus 1024 tokens of conservative chat framing allowance, with at most three text messages and no images/tools. This is a reservation bound, not an actual token estimate.

Usage settlement records cache hits, misses, output tokens, model, and the original price snapshot. A request crossing a peak/off-peak boundary is charged conservatively at the peak rate and marked estimated. Unknown usage, timeouts and process interruption retain the reservation across day/month boundaries and prevent automatic replay. Authentication, balance, model mismatch, sensitive response, or response after price expiry atomically marks the request unknown and pauses the project. Unknown amounts require explicit reconciliation; this version supplies no automatic release/resume command.

The same exact request can be reserved at most twice across batches, and only after an explicitly usage-accounted retryable failure. A successful or unknown request cannot be replayed by changing output directories or batch IDs. Reusing a batch ID with different request scope, limits or prices is rejected. Price or model changes do not invalidate content caches or enqueue the full catalog.

## Daily source-change processing

A separately approved private configuration may set `scope: "daily-source-changes"` with the same required schema, model, monetary limits and current prices. Its base `approvedRequestHashes` contains a SHA256 policy marker; this marker does not authorize a provider request. For each eligible daily task, the transport binds the exact request body inside an asynchronous scope and derives a unique request batch. All such batches still use the existing shared project ledger.

Only new entries or changed source facts compared with the previous complete catalog can gain a persistent daily eligibility marker. Existing planners must first accept their evidence and check fixed reviews, withdrawals, valid results and retry backoff. Metadata such as stars, display names and discovery topics does not grant eligibility. A changed package name, selected path or entry type requires review. Missing baselines fail closed. Deferred eligible tasks retain their marker; each source has at most two job attempts. Unchanged backlog stays excluded even if derived caches are cleared.

This mode scopes daily descriptions and categories only. Manual enrichment, trials, global tag normalization and bundle descriptions cannot use the daily authorization. Existing valid results are reused. No full catalog catch-up runs on activation. Price approval still expires within seven days; review current official prices before replacing the private configuration, without resetting the ledger.

## Optional coverage for the two daily Top100 lists

After explicit authorization, a daily policy can additionally set `boardDescriptions: "hot-rising-top100"`. The scheduler marks scheduled collection with `DSH_DAILY_UPDATE=1`; its startup `db:sync` is explicitly marked `0`. The opt-in does not enable manual enrichment, classification of unchanged backlog, or global tag processing.

With this option, collection preserves/plans descriptions but defers paid work to the publication step. That step computes **today’s** hot and rising lists against existing Stars history without importing early. It deduplicates the first 100 of each list and processes eligible missing descriptions before other source-change descriptions and categories. A reliable unchanged board source may be filled; unchanged sources outside the two lists cannot use this exception. Valid Chinese and completed same-source jobs are reused. Selected identity changes, fixed holds, insufficient functional evidence, unverified discovery, retry backoff and the two-attempt ceiling still block work. This step uses existing collected evidence; it does not certify missing package/source evidence or fetch arbitrary extra README content.

All requests use the existing Flash/non-thinking limits and persistent shared budget. The summary request cap also covers the board work; a 200-entry union does not authorize spending beyond the configured budget. No budget ledger is copied, reset or replaced on activation.

Before every publication, `board-description-report.json` in collector data records the actual displayed Chinese coverage, missing names/ranks and reasons. Missing results do **not** suppress new rankings. Ranked/detail/search records carry an optional `descriptionStatus` for UI display, kept separate from `descriptionZh` so status text cannot count as a completed summary. Previously released clients may still show the old generic placeholder until upgraded.

## Fixed trial workflow

Prepare and review a frozen plan first. Each of up to 30 projects has one request containing only its selected package identity and source facts. The approved config must match exactly the plan's batch ID and request hashes, plus `approvedPlanHash` binding project names, task kinds, request hashes and bounds in order. Changing a result label cannot silently attach a request to another project. Existing completed/fixed content is not part of the trial.

```sh
node --import tsx collector/src/model-trial.ts /outside/repo/plan.json /outside/repo/new-results --dry-run
```

Only after scope, budget, and private runtime configuration are approved:

```sh
node --use-env-proxy --import tsx collector/src/model-trial.ts /outside/repo/plan.json /outside/repo/new-results --run
```

The trial runs sequentially, without automatic retry, and stops on uncertain billing or request failure. It writes only parsed candidates and a budget report in a new output directory; it never changes source catalog data, rankings, production services, or fixed reviews. Review factual correctness, selected package identity, complete Chinese wording and category evidence before considering any merge. The trial allowance does not enable daily backlog processing: unlisted payloads are rejected by the shared transport.

The current implementation has offline tests for transport and cross-process accounting. A successful mock run is not evidence of a real API response or provider-side billing reconciliation. Provider price/alias changes still require a fresh review; `deepseek-flash` is a provider alias, not an immutable model-weight identifier.

Sources: [official release](https://api-docs.deepseek.com/updates/), [CNY pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/).

### 两榜生成前的来源复核

开启两榜日常开关后，先按当天预计算的热榜、涨榜各前 100 去重，定向复核中文缺口、历史待复核条目与缺少来源绑定的子包。每轮最多检查 200 个项目、并发 3；不在启动同步中触发。仓库不再公开或不再符合收录条件时移出当前来源，并在总检查上限内继续检查新入榜项目。

复核读取一个固定提交上的所选包清单、README 和已配置的功能证据文件，不执行第三方代码，不调用模型，也不自动从根 README 推断子包能力。读取失败保留历史证据和已有有效中文；确认所选包无效时撤回该对象的内容与安装声明，留下身份待纠正原因。结果写入 `board-source-report.json`，随后才进入中文优先队列与共用金额预算。

所选 README 的包身份、路径、来源版本和摘要指纹被保存，不再要求摘要必须重复完整包名。源文档没变化时，已证明来自子包的简介不会仅因根仓库营销文字变化而重复生成。SDK 消费端的依赖不足以证明可挂载插件身份；已知 SDK 库需显式插件声明、标记或 Cordis 依赖证据。固定复核源码发生变化仍暂停原结果，只有定向复核后才更新证据，不能自动改写哈希放行。


### Selected Skills descriptions

A separate private daily-policy opt-in, `skillsDescriptions: "skills-top100"`, enables missing descriptions in the current Skills Top100. It is absent/disabled by default and independent of `boardDescriptions`. Only a scheduled `DSH_DAILY_UPDATE=1` run can start this work; startup sync and auxiliary entry points cannot. Collection defers descriptions to the shared board runner when either opt-in is active. Both plugin boards and Skills share one summary request limit, concurrency at most three, the existing persistent project ledger, Flash with thinking disabled and at most 256 output tokens. Day/month limits are not enlarged.

Before dispatch, free checks pin a repository commit and bind one `SKILL.md` path to its frontmatter name and functional description. A previously selected path remains fixed; legacy child Skills require an explicit name in their current summary and exactly one matching file. Truncated trees, more than 40 Skill documents, ambiguous collections, changed identity, insufficient documentation, fixed review holds and exhausted attempts stay paused. Root product descriptions and topics are excluded from the selected Skill model input. No package code is installed or executed. Free source checks can continue with expired prices, but paid requests remain blocked.

Targeted fixed reviews can additionally bind `sourceSkill` (name, path, and complete document SHA-256). For full source records, missing or changed Skill evidence withholds that reviewed description even when the short summary is unchanged. Compact published rows retain the existing server-approved description contract. Resolving a duplicate path or a changed fixed review requires an explicit decision; it does not loosen the automatic source scanner.

`skills-source-report.json` records this run's checks; `board-description-report.json` continues to report the published Skills coverage and remaining reasons. The scope is frozen to the initial Top100 missing entries and does not pull in lower-ranked backlog after exclusions. Existing valid Chinese is reused. The collector restores a selected summary across its older mixed README cache only when the complete Skill document hash matches the pinned baseline. Any document change remains pending a targeted function review, including during the later free source refresh; equal frontmatter alone does not prove body changes harmless. This code path does not authorize deployment, activate production configuration, or approve a bulk catalog rewrite.
