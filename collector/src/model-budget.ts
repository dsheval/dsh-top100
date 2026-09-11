import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const NANOS = 1_000_000_000;
type Instant = number | Date;
export interface ModelPriceRates {
  inputHitCnyPerMillion: number;
  inputMissCnyPerMillion: number;
  outputCnyPerMillion: number;
}
export interface ModelBudgetConfig {
  projectId: "dsh-top100";
  model: "deepseek-flash";
  batchId: string;
  approvedRequestHashes: string[];
  approvedPlanHash?: string;
  dailyLimitCny: number;
  monthlyLimitCny: number;
  batchLimitCny: number;
  price: { version: string; verifiedAt: string; validUntil: string; peak: ModelPriceRates; offPeak: ModelPriceRates };
}
export type BudgetConfig = ModelBudgetConfig;
interface Entry {
  id: string; batch_id: string; request_hash: string; attempt: number; state: string;
  reserved_nano: number; settled_nano: number | null; started_at: number; day: string; month: string;
  input_bound: number; output_bound: number; price_json: string; outcome: string | null;
  input_hit: number | null; input_miss: number | null; output_tokens: number | null; estimated: number | null;
}
export interface ModelBudgetReport {
  paused: boolean;
  pauseReason: string | null;
  requests: number;
  inFlight: number;
  unknownRequests: number;
  reservedNanoCny: number;
  settledNanoCny: number;
  estimatedSettledNanoCny: number;
  actualTokens: { inputHit: number; inputMiss: number; output: number };
  model: "deepseek-flash";
  thinking: "disabled";
  batchId: string;
  daily: { spentNanoCny: number; reservedNanoCny: number; remainingNanoCny: number };
  monthly: { spentNanoCny: number; reservedNanoCny: number; remainingNanoCny: number };
  batch: { spentNanoCny: number; reservedNanoCny: number; remainingNanoCny: number };
}
function timestamp(value: Instant): number {
  const n = value instanceof Date ? value.getTime() : value;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("budget-invalid-time");
  return n;
}
function periods(now: number) {
  const day = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  return { day, month: day.slice(0, 7) };
}
function positive(value: number, maximum: number, code: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(code);
  const result = Math.floor(value * NANOS);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error(code);
  return result;
}
function tokens(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) throw new Error("budget-invalid-token-count");
  return value;
}
function code(value: string): string {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(value)) throw new Error("budget-invalid-reason-code");
  return value;
}
function isPeak(now: number): boolean {
  const d = new Date(now), day = d.getUTCDay(), hour = d.getUTCHours();
  return day >= 1 && day <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}
// Inspect every UTC-hour boundary: matching endpoints alone misses a crossed price window.
function samePriceWindow(start: number, end: number): boolean {
  const initial = isPeak(start);
  if (end - start > 24 * 3_600_000) return false;
  for (let t = Math.floor(start / 3_600_000) * 3_600_000 + 3_600_000; t <= end; t += 3_600_000) {
    if (isPeak(t) !== initial) return false;
  }
  return isPeak(end) === initial;
}
function cost(rates: ModelPriceRates, hit: number, miss: number, output: number): number {
  // Integer nano-CNY rounded upward; BigInt multiplication prevents floating token-cost drift.
  const rate = (v: number) => BigInt(Math.ceil(v * NANOS));
  const numerator = BigInt(hit) * rate(rates.inputHitCnyPerMillion)
    + BigInt(miss) * rate(rates.inputMissCnyPerMillion) + BigInt(output) * rate(rates.outputCnyPerMillion);
  const n = Number((numerator + 999_999n) / 1_000_000n);
  if (!Number.isSafeInteger(n)) throw new Error("budget-cost-overflow");
  return n;
}
export function validateBudgetConfig(config: ModelBudgetConfig, now?: Instant): void {
  if (!config || config.projectId !== "dsh-top100" || config.model !== "deepseek-flash"
    || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(config.batchId ?? "")) throw new Error("budget-missing-or-invalid-config");
  positive(config.dailyLimitCny, 5, "budget-invalid-daily-limit");
  positive(config.monthlyLimitCny, 50, "budget-invalid-monthly-limit");
  positive(config.batchLimitCny, 1, "budget-invalid-batch-limit");
  if (!Array.isArray(config.approvedRequestHashes) || !config.approvedRequestHashes.length
    || config.approvedRequestHashes.some(h => !/^[a-f0-9]{64}$/.test(h))
    || new Set(config.approvedRequestHashes).size !== config.approvedRequestHashes.length) throw new Error("budget-invalid-allowlist");
  if (config.approvedPlanHash !== undefined && !/^[a-f0-9]{64}$/.test(config.approvedPlanHash)) throw new Error("budget-invalid-plan-hash");
  const price = config.price;
  if (!price || !/^[a-zA-Z0-9._-]{1,100}$/.test(price.version ?? "")
    || !Number.isFinite(Date.parse(price.validUntil)) || !Number.isFinite(Date.parse(price.verifiedAt))
    || Date.parse(price.validUntil) <= Date.parse(price.verifiedAt)
    || Date.parse(price.validUntil) - Date.parse(price.verifiedAt) > 7 * 24 * 3_600_000) throw new Error("budget-invalid-price-config");
  for (const field of ["inputHitCnyPerMillion", "inputMissCnyPerMillion", "outputCnyPerMillion"] as const) {
    const peak = price.peak?.[field], low = price.offPeak?.[field];
    if (!Number.isFinite(peak) || !Number.isFinite(low) || peak <= 0 || low <= 0 || low > peak
      || peak > 1_000_000) throw new Error("budget-invalid-price-config");
  }
  if (price.peak.inputHitCnyPerMillion > price.peak.inputMissCnyPerMillion
    || price.offPeak.inputHitCnyPerMillion > price.offPeak.inputMissCnyPerMillion) throw new Error("budget-invalid-price-config");
  if (now !== undefined && (timestamp(now) >= Date.parse(price.validUntil) || timestamp(now) < Date.parse(price.verifiedAt))) throw new Error("budget-price-expired-or-not-yet-valid");
}

/** One persistent project ledger shared by all processes and all model tasks. No network or credentials. */
export class BudgetLedger {
  private db: DatabaseSync;
  private config: ModelBudgetConfig;
  constructor(path: string, config: ModelBudgetConfig) {
    validateBudgetConfig(config);
    if (!path || path === ":memory:") throw new Error("budget-persistent-path-required");
    this.config = structuredClone(config);
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS budget_project (project_id TEXT PRIMARY KEY, daily_nano INTEGER NOT NULL, monthly_nano INTEGER NOT NULL, pause_reason TEXT);
        CREATE TABLE IF NOT EXISTS budget_batches (batch_id TEXT PRIMARY KEY, approval_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS budget_requests (
          id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, request_hash TEXT NOT NULL, attempt INTEGER NOT NULL,
          state TEXT NOT NULL, reserved_nano INTEGER NOT NULL, settled_nano INTEGER,
          started_at INTEGER NOT NULL, ended_at INTEGER, day TEXT NOT NULL, month TEXT NOT NULL,
          input_bound INTEGER NOT NULL, output_bound INTEGER NOT NULL, price_json TEXT NOT NULL,
          input_hit INTEGER, input_miss INTEGER, output_tokens INTEGER, model TEXT, estimated INTEGER,
          outcome TEXT, reason TEXT, UNIQUE(request_hash, attempt));`);
      this.transaction(() => {
        const daily = positive(config.dailyLimitCny, 5, "budget-invalid-daily-limit");
        const monthly = positive(config.monthlyLimitCny, 50, "budget-invalid-monthly-limit");
        const project = this.db.prepare("SELECT * FROM budget_project").get() as { project_id: string; daily_nano: number; monthly_nano: number } | undefined;
        if (project && (project.project_id !== config.projectId || project.daily_nano !== daily || project.monthly_nano !== monthly)) throw new Error("budget-project-policy-mismatch");
        if (!project) this.db.prepare("INSERT INTO budget_project VALUES (?,?,?,NULL)").run(config.projectId, daily, monthly);
        const approval = JSON.stringify({ planHash: config.approvedPlanHash ?? null, model: config.model, limit: positive(config.batchLimitCny, 1, "budget-invalid-batch-limit"), hashes: [...config.approvedRequestHashes].sort(), price: config.price });
        const batch = this.db.prepare("SELECT approval_json FROM budget_batches WHERE batch_id=?").get(config.batchId) as { approval_json: string } | undefined;
        if (batch && batch.approval_json !== approval) throw new Error("budget-batch-approval-mismatch");
        if (!batch) this.db.prepare("INSERT INTO budget_batches VALUES (?,?)").run(config.batchId, approval);
      });
    } catch (error) { this.db.close(); throw error; }
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private entries(): Entry[] { return this.db.prepare("SELECT * FROM budget_requests").all() as unknown as Entry[]; }
  private get(id: string): Entry {
    const entry = this.db.prepare("SELECT * FROM budget_requests WHERE id=?").get(id) as unknown as Entry | undefined;
    if (!entry) throw new Error("budget-unknown-request");
    return entry;
  }
  private snapshot(now: number): ModelBudgetReport {
    const p = periods(now), all = this.entries(), pending = all.filter(r => r.state !== "settled");
    const reserved = pending.reduce((sum, r) => sum + r.reserved_nano, 0);
    const balance = (limit: number, matches: (r: Entry) => boolean, reserve: number) => {
      const spent = all.filter(r => r.state === "settled" && matches(r)).reduce((sum, r) => sum + r.settled_nano!, 0);
      return { spentNanoCny: spent, reservedNanoCny: reserve, remainingNanoCny: Math.max(0, limit - spent - reserve) };
    };
    const pause = this.db.prepare("SELECT pause_reason FROM budget_project").get() as { pause_reason: string | null };
    return {
      paused: pause.pause_reason !== null, pauseReason: pause.pause_reason, requests: all.length,
      model: this.config.model, thinking: "disabled", batchId: this.config.batchId,
      actualTokens: { inputHit: all.reduce((n, r) => n + (r.input_hit ?? 0), 0), inputMiss: all.reduce((n, r) => n + (r.input_miss ?? 0), 0), output: all.reduce((n, r) => n + (r.output_tokens ?? 0), 0) },
      estimatedSettledNanoCny: all.filter(r => r.estimated === 1).reduce((n, r) => n + (r.settled_nano ?? 0), 0),
      inFlight: pending.length, unknownRequests: pending.filter(r => r.state === "unknown").length,
      reservedNanoCny: reserved, settledNanoCny: all.reduce((sum, r) => sum + (r.settled_nano ?? 0), 0),
      daily: balance(positive(this.config.dailyLimitCny, 5, "budget-invalid-daily-limit"), r => r.day === p.day, reserved),
      monthly: balance(positive(this.config.monthlyLimitCny, 50, "budget-invalid-monthly-limit"), r => r.month === p.month, reserved),
      batch: balance(positive(this.config.batchLimitCny, 1, "budget-invalid-batch-limit"), r => r.batch_id === this.config.batchId,
        pending.filter(r => r.batch_id === this.config.batchId).reduce((sum, r) => sum + r.reserved_nano, 0)),
    };
  }
  reserve(input: { requestHash: string; inputTokensBound: number; maxOutputTokens: number; now: Instant }) {
    const now = timestamp(input.now), p = periods(now);
    tokens(input.inputTokensBound); tokens(input.maxOutputTokens);
    if (!input.inputTokensBound || !input.maxOutputTokens) throw new Error("budget-invalid-token-bound");
    if (!this.config.approvedRequestHashes.includes(input.requestHash)) throw new Error("budget-request-not-approved");
    validateBudgetConfig(this.config, now);
    const reservedNanoCny = cost(this.config.price.peak, 0, input.inputTokensBound, input.maxOutputTokens);
    return this.transaction(() => {
      const report = this.snapshot(now);
      if (report.paused) throw new Error("budget-project-paused");
      const previous = this.db.prepare("SELECT * FROM budget_requests WHERE request_hash=? ORDER BY attempt DESC LIMIT 1").get(input.requestHash) as unknown as Entry | undefined;
      if (previous && (previous.state !== "settled" || previous.outcome !== "retryable")) throw new Error("budget-request-already-reserved-or-complete");
      if (previous && previous.attempt >= 2) throw new Error("budget-attempt-limit");
      if (report.inFlight >= 3) throw new Error("budget-concurrency-limit");
      if ([report.daily, report.monthly, report.batch].some(b => reservedNanoCny > b.remainingNanoCny)) throw new Error("budget-exhausted");
      const id = randomUUID(), attempt = (previous?.attempt ?? 0) + 1;
      this.db.prepare(`INSERT INTO budget_requests
        (id,batch_id,request_hash,attempt,state,reserved_nano,started_at,day,month,input_bound,output_bound,price_json)
        VALUES (?,?,?,?,'reserved',?,?,?,?,?,?,?)`).run(id, this.config.batchId, input.requestHash, attempt, reservedNanoCny, now, p.day, p.month,
          input.inputTokensBound, input.maxOutputTokens, JSON.stringify(this.config.price));
      return { id, reservedNanoCny, attempt };
    });
  }
  settle(id: string, usage: { inputHit: number; inputMiss: number; output: number; now: Instant; model: string; outcome?: "success" | "retryable" }) {
    const now = timestamp(usage.now);
    tokens(usage.inputHit); tokens(usage.inputMiss); tokens(usage.output);
    if (usage.outcome !== undefined && !["success", "retryable"].includes(usage.outcome)) throw new Error("budget-invalid-outcome");
    return this.transaction(() => {
      const entry = this.get(id);
      if (entry.state === "settled") throw new Error("budget-already-settled");
      if (now < entry.started_at) throw new Error("budget-time-before-request");
      const price = JSON.parse(entry.price_json) as ModelBudgetConfig["price"];
      const stopReason = now >= Date.parse(price.validUntil) ? "price-expired-during-request"
        : usage.model !== this.config.model || usage.inputHit + usage.inputMiss > entry.input_bound || usage.output > entry.output_bound
          ? "usage-or-model-mismatch" : null;
      if (stopReason) {
        this.markUnknownAndHalt(id, stopReason);
        return { settled: false as const, estimated: true, costNanoCny: null };
      }
      const estimated = !samePriceWindow(entry.started_at, now);
      const rates = estimated || isPeak(entry.started_at) ? price.peak : price.offPeak;
      const costNanoCny = cost(rates, usage.inputHit, usage.inputMiss, usage.output);
      this.db.prepare(`UPDATE budget_requests SET state='settled',settled_nano=?,ended_at=?,input_hit=?,input_miss=?,output_tokens=?,model=?,estimated=?,outcome=?,reason=NULL WHERE id=?`)
        .run(costNanoCny, now, usage.inputHit, usage.inputMiss, usage.output, usage.model, Number(estimated), usage.outcome ?? "success", id);
      return { settled: true as const, estimated, costNanoCny };
    });
  }
  unknown(id: string, reason: string): void {
    code(reason);
    this.transaction(() => { if (this.get(id).state === "settled") throw new Error("budget-already-settled");
      this.db.prepare("UPDATE budget_requests SET state='unknown',reason=? WHERE id=?").run(reason, id); });
  }
  private markUnknownAndHalt(id: string, reason: string): void {
    this.db.prepare("UPDATE budget_requests SET state='unknown',reason=? WHERE id=?").run(reason, id);
    this.db.prepare("UPDATE budget_project SET pause_reason=COALESCE(pause_reason,?)").run(reason);
  }
  /** Account failures and untrusted usage must close the project gate in the same commit as the hold. */
  unknownAndHalt(id: string, reason: string): void {
    code(reason);
    this.transaction(() => {
      if (this.get(id).state === "settled") throw new Error("budget-already-settled");
      this.markUnknownAndHalt(id, reason);
    });
  }
  halt(reason: string): void { code(reason); this.transaction(() => { this.db.prepare("UPDATE budget_project SET pause_reason=COALESCE(pause_reason,?)").run(reason); }); }
  report(now: Instant): ModelBudgetReport { return this.transaction(() => this.snapshot(timestamp(now))); }
  close(): void { this.db.close(); }
}
