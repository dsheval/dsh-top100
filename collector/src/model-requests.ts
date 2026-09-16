/** Every real model request shares one persistent, scope-bound budget. */
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BudgetLedger, validateBudgetConfig, type BudgetConfig } from "./model-budget.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// All production entry points resolve this same mount; batches/output folders cannot select a new ledger.
export const MODEL_LEDGER_PATH = resolve(projectRoot, "runtime/model-budget.sqlite");
export const MODEL_REQUESTS_PAUSED = "Model requests are paused: approved scope and accepted budget configuration are required; use --dry-run or --limit 0";
export interface ModelRequestControl {
  /** Test injection is never exposed as a CLI/production option. */
  requestMode?: "offline-test";
  offlineTransport?: typeof fetch;
}
export interface ApprovedModelBudget extends BudgetConfig {
  schemaVersion: 1;
  approval: "approved";
  protectionVersion: "model-budget-v1";
  /** Explicit standing authorization; callers still bind each eligible daily request. */
  scope?: "daily-source-changes";
  /** Optional standing scope for missing descriptions in today's two Top100 lists. */
  boardDescriptions?: "hot-rising-top100";
}
const dailyRequest = new AsyncLocalStorage<string>();

export function withDailyModelRequest<T>(body: unknown, operation: () => T): T {
  const { requestHash } = inspectModelRequest("https://api.deepseek.com/chat/completions", { method: "POST", body: JSON.stringify(body) });
  return dailyRequest.run(requestHash, operation);
}

/** Keep daily authorization out of auxiliary tasks and manual bulk entry points. */
export function bindModelBudget(config: ApprovedModelBudget, requestHash: string, dailyHash?: string): ApprovedModelBudget {
  if (config.scope !== "daily-source-changes") return config;
  if (requestHash !== dailyHash) throw new Error("daily-model-request-outside-scope");
  return { ...config, batchId: `daily-${requestHash}`, approvedRequestHashes: [requestHash], approvedPlanHash: requestHash };
}

export function dailySourceChangesOnly(): boolean {
  try { return loadApprovedModelBudget().scope === "daily-source-changes"; } catch { return false; }
}
export function dailyBoardDescriptionsEnabled(): boolean {
  try {
    const config = loadApprovedModelBudget();
    return config.scope === "daily-source-changes" && config.boardDescriptions === "hot-rising-top100";
  } catch { return false; }
}
/** Evidence refresh is free; expired model prices must not stop identity checks. */
export function dailyBoardSourceChecksEnabled(): boolean {
  try {
    const config = readApprovedModelBudget();
    return process.env.DSH_DAILY_UPDATE === '1' && config.scope === 'daily-source-changes' && config.boardDescriptions === 'hot-rising-top100';
  } catch { return false; }
}

/** Scheduler startup db:sync and auxiliary commands must not start board work. */
export function isDailyBoardRun(): boolean {
  return process.env.DSH_DAILY_UPDATE === "1" && dailyBoardDescriptionsEnabled();
}
function outsideRepository(path: string): boolean {
  const part = relative(realpathSync(projectRoot), realpathSync(path));
  return part.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(part);
}
/** Read only the explicitly supplied private config; never search for credentials or alternate config. */
function readApprovedModelBudget(now?: number): ApprovedModelBudget {
  const path = process.env.DSH_MODEL_BUDGET_CONFIG;
  let fd: number | undefined;
  try {
    if (!path || !isAbsolute(path) || !outsideRepository(path)) throw new Error();
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
      || (process.getuid && stat.uid !== process.getuid())) throw new Error();
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > 200_000) throw new Error();
    const config = JSON.parse(readFileSync(fd, "utf8")) as ApprovedModelBudget;
    if (config.schemaVersion !== 1 || config.approval !== "approved" || config.protectionVersion !== "model-budget-v1") throw new Error();
    if (config.scope !== undefined && config.scope !== "daily-source-changes") throw new Error();
    if (config.boardDescriptions !== undefined && (config.scope !== "daily-source-changes" || config.boardDescriptions !== "hot-rising-top100")) throw new Error();
    validateBudgetConfig(config, now);
    if (now !== undefined) validateBudgetConfig(config, now + 45_000);
    return config;
  } catch { throw new Error(MODEL_REQUESTS_PAUSED); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export function loadApprovedModelBudget(now = Date.now()): ApprovedModelBudget {
  return readApprovedModelBudget(now);
}
/** Monitoring may inspect expired prices, but cannot authorize or renew them. No private paths or request hashes. */
export function modelPolicyHealth() {
  const config = readApprovedModelBudget();
  return { model: config.model, dailyLimitCny: config.dailyLimitCny, monthlyLimitCny: config.monthlyLimitCny,
    priceValidUntil: config.price.validUntil, scope: config.scope, boardDescriptions: config.boardDescriptions };
}
export function modelRequestsEnabled(): boolean {
  if (process.env.DSH_MODEL_REQUESTS_ENABLED !== "1" || !process.env.DEEPSEEK_API_KEY?.trim()) return false;
  try {
    const config = loadApprovedModelBudget();
    // Scheduler startup explicitly uses 0: block every paid entry point before
    // it can reserve budget, including newly eligible classification jobs.
    return config.scope !== "daily-source-changes" || process.env.DSH_DAILY_UPDATE !== "0";
  } catch { return false; }
}
function offlineTransport(control: ModelRequestControl): typeof fetch | undefined {
  return process.env.NODE_ENV === "test" && control.requestMode === "offline-test" ? control.offlineTransport : undefined;
}
export function canRequestModel(control: ModelRequestControl = {}): boolean {
  return !!offlineTransport(control) || modelRequestsEnabled() && (!dailySourceChangesOnly() || !!dailyRequest.getStore());
}
export function inspectModelRequest(url: string, init: RequestInit) {
  if (url !== "https://api.deepseek.com/chat/completions" || init.method !== "POST" || typeof init.body !== "string") throw new Error("model-request-not-approved");
  const body = JSON.parse(init.body);
  const allowed = new Set(["model", "messages", "temperature", "max_tokens", "thinking"]);
  if (!body || Object.keys(body).some(k => !allowed.has(k)) || body.model !== "deepseek-flash"
    || body.thinking?.type !== "disabled" || Object.keys(body.thinking).length !== 1
    || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 256
    || typeof body.temperature !== "number" || body.temperature < 0 || body.temperature > 0.5
    || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 3
    || body.messages.some((m: any) => !m || !["system", "user"].includes(m.role) || typeof m.content !== "string" || Object.keys(m).some(k => !["role", "content"].includes(k)))) throw new Error("model-request-not-approved");
  const bytes = Buffer.byteLength(init.body, "utf8");
  if (bytes > 32_000) throw new Error("model-input-too-large");
  // Text-only, <=3 messages, no tools/images: one token per UTF-8 byte plus a
  // conservative 1024-token allowance for provider chat framing. Not a token estimate.
  return { requestHash: createHash("sha256").update(init.body).digest("hex"), inputTokensBound: bytes + 1024, maxOutputTokens: body.max_tokens as number };
}
function usageFrom(data: any) {
  const usage = data?.usage;
  const values = [usage?.prompt_tokens, usage?.prompt_cache_hit_tokens, usage?.prompt_cache_miss_tokens, usage?.completion_tokens, usage?.total_tokens];
  if (values.some(v => !Number.isSafeInteger(v) || v < 0)
    || usage.prompt_tokens !== usage.prompt_cache_hit_tokens + usage.prompt_cache_miss_tokens
    || usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens) throw new Error("model-usage-unconfirmed");
  return { inputHit: usage.prompt_cache_hit_tokens as number, inputMiss: usage.prompt_cache_miss_tokens as number, output: usage.completion_tokens as number };
}
/** Separated for integration tests; real callers must enter through requestModel. */
export async function dispatchBudgetedModel(ledger: BudgetLedger, url: string, init: RequestInit, transport: typeof fetch, now: () => number = Date.now): Promise<Response> {
  const request = inspectModelRequest(url, init);
  const reservation = ledger.reserve({ ...request, now: now() });
  let finalized = false;
  try {
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
    const response = await transport(url, { ...init, signal, redirect: "error" });
    if ([401, 402, 403].includes(response.status)) {
      ledger.unknownAndHalt(reservation.id, "authentication-or-balance"); finalized = true;
      throw new Error("model-account-paused");
    }
    const data = await response.clone().json();
    const secret = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "");
    if (secret && JSON.stringify(data).includes(secret)) {
      ledger.unknownAndHalt(reservation.id, "sensitive-response"); finalized = true; throw new Error("model-response-not-approved");
    }
    const usage = usageFrom(data);
    if (data.model !== "deepseek-flash") {
      ledger.unknownAndHalt(reservation.id, "model-mismatch"); finalized = true; throw new Error("model-response-not-approved");
    }
    if (usage.inputHit + usage.inputMiss > request.inputTokensBound || usage.output > request.maxOutputTokens) {
      ledger.unknownAndHalt(reservation.id, "usage-bound-exceeded"); finalized = true; throw new Error("model-usage-bound-exceeded");
    }
    const settlement = ledger.settle(reservation.id, { ...usage, model: data.model, now: now(), outcome: response.status === 429 || response.status >= 500 ? "retryable" : "success" });
    finalized = true;
    if (!settlement.settled) throw new Error("model-settlement-not-confirmed");
    return response;
  } catch {
    if (!finalized) ledger.unknown(reservation.id, "transport-or-usage-unknown");
    // Do not propagate provider responses, network errors, URLs or headers into logs.
    throw new Error("model-request-stopped-inspect-budget-report");
  }
}
/** Recheck scope, endpoint, model and budget at every dispatch, including retries. */
export async function requestModel(control: ModelRequestControl, url: string, init: RequestInit): Promise<Response> {
  const offline = offlineTransport(control);
  if (offline) return offline(url, init);
  if (!modelRequestsEnabled()) throw new Error(MODEL_REQUESTS_PAUSED);
  const config = bindModelBudget(loadApprovedModelBudget(), inspectModelRequest(url, init).requestHash, dailyRequest.getStore());
  const authorization = new Headers(init.headers).get("Authorization");
  if (authorization !== `Bearer ${process.env.DEEPSEEK_API_KEY!.trim()}`) throw new Error("model-credential-not-approved");
  const ledger = new BudgetLedger(MODEL_LEDGER_PATH, config);
  try { return await dispatchBudgetedModel(ledger, url, init, fetch); }
  finally {
    try { console.info(`[model-budget] ${JSON.stringify(ledger.report(Date.now()))}`); }
    finally { ledger.close(); }
  }
}
