# Daily operations and GEO integration

The managed scheduler is opt-in. `DSH_AUTOMATION_ENABLED=0` retains the previous scheduler. The implementation does not enable production settings, deploy services, renew prices, or send external notifications.

## Processing and recovery

With automation enabled, the Linux scheduler holds an OS `flock` on `runtime/operations/scheduler.lock`. Its subprocesses inherit the descriptor. Progress is stored atomically in `operations/days/YYYY-MM-DD.json`, using the configured timezone (production: Asia/Shanghai).

The stages are `collect`, `publish`, and `verify`. After the configured collection hour, the scheduler checks every minute, including after the old five-minute launch window. Completed stages are skipped. Collection/publication get at most three attempts per day, with 15/30-minute backoff; verification gets at most six, starting at five minutes. Each command is limited to 90 minutes. Publication cannot start for an earlier date after midnight. Recovery preserves the model ledger and description/category jobs; it never clears budget reservations or retries completed paid requests intentionally. Ambiguous paid requests remain governed by the existing ledger.

Startup only starts the clock and heartbeat. Its first scheduling check is one minute later. For migration after today's legacy collection, set `DSH_AUTOMATION_START_DATE` to the next Beijing date so enabling recovery cannot repeat that collection. `RUN_COLLECT_ON_STARTUP` is ignored in managed mode. Do not run manual collection/publication concurrently with a managed run.

## Source handling

- A package whose declaration/entry is conclusively invalid at a pinned commit is quarantined from plugin rankings/search, with normal ranking replacement. Original source and statistics remain stored. Missing metadata, a renamed package or transient network errors alone do not trigger this quarantine rule.
- Free source recovery persists in `source-recovery.json` beside the collector source data. Previously failed sources and quarantined entries can be checked even after leaving the boards: at most 20 off-board recoveries per run, within the existing total cap of 200 source checks. Unrelated long-tail entries are not added. Attempts are persisted before reading sources; delays are 1, 2, 4, then 7 days, capped at 7. New repository updates/identity changes allow an earlier check but never bypass identity/content validation. These counters are separate from paid jobs. Successful revalidation removes the quarantine and recovery record; normal discovery can also close a record after a fresh valid source check. Repository exclusions remove obsolete recovery records.
- Missing selected-package README may use at most its own `package.json` (16 KiB) and conventional `src/index.ts` (24 KiB). Static parsing extracts literal registrations and selected tool/config expressions into at most 1,150 characters; the existing model input limit stays 1,200 characters. No repository code executes, no root README is substituted, and no arbitrary import graph is traversed.
- These are source facts, not an installation/runtime or semantic-completeness guarantee. Insufficient facts remain missing; generated descriptions must pass the existing Chinese validation. Invalid model output is held rather than repeatedly regenerated.
- Evidence binds repository, package, directory, commit, file hashes and the exact facts summary. Restoration preserves historical evidence without pretending it was freshly checked. Identity validity and content readiness are reported separately.
- Fixed source reviews and explicit withdrawals cannot be unlocked by generic source facts. A changed reviewed JS/TS file may pass only when its syntax tree prints identically to the original reviewed file after removing ordinary comments. The original file is fetched at its fixed commit and must match the already approved SHA-256. Automatic semicolon insertion, strings, templates and JSX whitespace are retained. Directive/JSDoc comments, unsupported file types, syntax errors, missing files and unreadable/unverified baselines fail this narrow equivalence check. No arbitrary semantic equivalence is claimed.
- Automatic equivalence retains the original approved marker and stores the actual current fingerprint, commit, file hashes and decision separately in `discovery.functionReview`. It never changes the fixed review configuration. Material changes remain held, with candidate evidence and bounded triage signals (for example changed imports or process environment writes) in `board-source-report.json.reviewCandidates`; these are review candidates, not newly approved Chinese descriptions. A later return to the approved content or proven syntax equivalence can recover automatically. Existing model, thinking, concurrency, output, budget and long-tail scope restrictions remain unchanged.

## Independent watchdog

The `watchdog` Compose service uses the same image but runs independently of the scheduler. It reads runtime data and writes only its own operations reports/event outbox. It does not load model keys, call a model or restart services. Every five minutes it checks local snapshot files against manifest sizes/hashes, public manifest and both public boards, actual rendered Chinese coverage, scheduler heartbeat, daily completion and the read-only model ledger.

A date-stamped manifest alone is never treated as proof of successful collection. The daily stage journal is authoritative. Updates remain publishable with description gaps; publication integrity failures fail verification. Current notification defaults:

| Condition | Handling |
| --- | --- |
| Individual missing-source/review items, including protected source changes | Initially informational; warning after three distinct publication/check dates, or 48 hours of continuing impact on a published board |
| More than five missing descriptions on either board | Warning |
| More than 5% of metadata refreshes unresolved | Warning |
| Price validity below 48 hours / expired | Warning / critical |
| Unknown or stale model reservations | Warning; never clear them |
| Budget pause or unreadable budget health | Critical |
| No verified daily completion two hours after scheduled start | Critical |
| Scheduler heartbeat older than three minutes | Critical, after startup grace |
| Broken public publication | Critical, with 15-minute publication transition grace |

The watchdog observes the scheduler, not an outage of the entire server. A future GEO consumer should also check that `status.json.checkedAt` is no more than ten minutes old; missing/stale status must be treated as a monitoring outage. Docker healthchecks expose stale scheduler/watchdog heartbeats. GEO delivery and external server-outage monitoring remain disconnected until integration is authorized.

Five-minute polls and restarts do not count as new daily failures. An unchanged escalated incident produces no repeated actionable event. Once the issue disappears from a successful observation, a single recovery event closes it. Source recovery entries keep off-board failures visible; unavailable observations preserve existing incidents rather than claiming recovery. A missing description can remain informational while the rest of the update completes; more than five missing descriptions still triggers the board-level warning immediately.

The 48-hour clock starts when the issue is first observed on a published board, persists across restarts and resets after a confirmed exit from the boards or recovery. An off-board quarantined entry with a successful ranking replacement does not trigger the time rule. A fresh successful audit must confirm ongoing board impact before escalation; retaining an old incident during an unavailable audit neither escalates nor resolves it. The independent publication-outage warning remains active during that failure.

## Private integration files

All files below are under `runtime/operations/`, outside public-data and Git:

- `status.json`: schemaVersion 1, checkedAt, overall status (`healthy`, `degraded`, `action-required`), current operation, publication results, monetary totals and issues.
- `incidents.json`: persistent issue state; an unchanged issue emits no new event.
- `events/<id>.json`: durable events with stable ID, timestamp, kind (`opened`, `changed`, `resolved`), incident and `actionable`. The future GEO adapter should deduplicate on ID, notify only actionable events and retain its own delivery cursor. No event is marked delivered by the producer.
- `publication-audit.json`: successful scheduler acceptance evidence, including the accepted snapshot ID.

Event creation precedes incident acknowledgement, and retry IDs remain stable across a crash between those writes. Reports contain local error codes, public repository identities and aggregate usage, not credentials, raw provider bodies or private config paths. These private files must not be mounted into the public website.

## Activation checklist

1. Complete local checks and the Linux CI lock test/image build. Back up runtime consistently, preserving the original budget ledger.
2. Prepare `runtime/operations/`; configure `DSH_AUTOMATION_ENABLED=1`, `DSH_AUTOMATION_START_DATE`, and `DSH_PUBLIC_ORIGIN` (HTTPS origin only, no path/credentials).
3. Keep the existing scheduler private budget/key mounts. Mount only the private budget configuration read-only into the watchdog, using the same configured path; do not mount the model key. The watchdog must have the same UID needed to read the owner-only budget configuration.
4. After deployment approval, run the existing Compose file chain with profile `automation`, starting scheduler and watchdog. Check both heartbeats and zero startup model calls before the activation date.
5. Verify the first completed real run against the public snapshot and ledger. A passing local simulation does not prove production acceptance.

Prices are not automatically extended. The watchdog warns before expiry; a separate verified price update is still required. GEO connection is deferred, so warnings are recorded but not yet delivered to a person.
