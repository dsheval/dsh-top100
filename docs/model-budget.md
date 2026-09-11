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

## Trial workflow

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
