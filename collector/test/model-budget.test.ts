import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { BudgetLedger, validateBudgetConfig, type ModelBudgetConfig } from "../src/model-budget.js";
const run = promisify(execFile);
const dirs: string[] = [], ledgers: BudgetLedger[] = [];
const now = Date.parse("2026-09-11T02:00:00Z");
const hashes = Array.from({ length: 20 }, (_, i) => i.toString(16).padStart(64, "0"));
function config(overrides: Partial<ModelBudgetConfig> = {}): ModelBudgetConfig {
  return { projectId: "dsh-top100", model: "deepseek-flash", batchId: "sample-1", approvedRequestHashes: hashes,
    dailyLimitCny: 5, monthlyLimitCny: 50, batchLimitCny: 1,
    price: { version: "fixture-v1", verifiedAt: "2026-09-10T00:00:00Z", validUntil: "2026-09-17T00:00:00Z", peak: { inputHitCnyPerMillion: 0.04, inputMissCnyPerMillion: 2, outputCnyPerMillion: 8 },
      offPeak: { inputHitCnyPerMillion: 0.02, inputMissCnyPerMillion: 1, outputCnyPerMillion: 4 } }, ...overrides };
}
function monthEndConfig() { const c = config(); c.price.verifiedAt = "2026-09-29T00:00:00Z"; c.price.validUntil = "2026-10-06T00:00:00Z"; return c; }
function path() { const d = mkdtempSync(join(tmpdir(), "model-budget-")); dirs.push(d); return join(d, "ledger.sqlite"); }
function open(p = path(), cfg = config()) { const l = new BudgetLedger(p, cfg); ledgers.push(l); return l; }
function reserve(l: BudgetLedger, hash = hashes[0], at = now, inputTokensBound = 1000, maxOutputTokens = 256) {
  return l.reserve({ requestHash: hash, inputTokensBound, maxOutputTokens, now: at });
}
function settle(l: BudgetLedger, id: string, at = now + 1000, extra = {}) {
  return l.settle(id, { inputHit: 100, inputMiss: 400, output: 50, now: at, model: "deepseek-flash", ...extra });
}
afterEach(() => { for (const l of ledgers.splice(0)) { try { l.close(); } catch {} } for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
describe("persistent project model budget", () => {
  it("fails closed without explicit valid policy, approved hashes, model or prices", () => {
    for (const cfg of [undefined, {}, config({ model: "deepseek-pro" as never }), config({ approvedRequestHashes: [] }),
      config({ dailyLimitCny: 6 }), config({ monthlyLimitCny: 51 }), config({ batchLimitCny: 1.01 }), config({ dailyLimitCny: 0 }),
      config({ price: undefined as never })]) expect(() => validateBudgetConfig(cfg as ModelBudgetConfig, now)).toThrow();
    expect(() => new BudgetLedger(":memory:", config())).toThrow("persistent");
    expect(() => validateBudgetConfig(config(), Date.parse("2027-01-02"))).toThrow("expired");
  });
  it("rejects unverified, future, expired or overlong price validity without opening a ledger", () => {
    for (const values of [{ verifiedAt: undefined }, { verifiedAt: "2026-09-12T00:00:00Z" },
      { validUntil: "2026-09-10T00:00:00Z" }, { validUntil: "2026-09-18T00:00:00Z" }]) {
      const c = config(); Object.assign(c.price, values);
      expect(() => validateBudgetConfig(c, now)).toThrow();
    }
  });
  it("fails closed on a corrupt persistent database", () => {
    const p = path(); writeFileSync(p, "not a sqlite ledger");
    expect(() => open(p)).toThrow();
  });
  it("reserves peak cache-miss cost in integer nanos then settles cache-aware usage", () => {
    const l = open(), r = reserve(l);
    expect(r).toMatchObject({ attempt: 1, reservedNanoCny: 4_048_000 });
    expect(l.report(now)).toMatchObject({ inFlight: 1, reservedNanoCny: 4_048_000, settledNanoCny: 0 });
    expect(settle(l, r.id)).toEqual({ settled: true, estimated: false, costNanoCny: 1_204_000 });
    expect(l.report(now)).toMatchObject({ inFlight: 0, reservedNanoCny: 0, settledNanoCny: 1_204_000 });
    expect(() => reserve(l)).toThrow("already-reserved-or-complete");
    expect(() => settle(l, r.id)).toThrow("already-settled");
  });
  it("allows only approved exact hashes and at most one explicitly retryable additional attempt", () => {
    const l = open();
    expect(() => reserve(l, "f".repeat(64))).toThrow("not-approved");
    const r = reserve(l);
    expect(() => reserve(l)).toThrow("already-reserved");
    settle(l, r.id, now + 1, { inputHit: 0, inputMiss: 0, output: 0, outcome: "retryable" });
    const retry = reserve(l, hashes[0], now + 2);
    expect(retry.attempt).toBe(2);
    settle(l, retry.id, now + 3, { inputHit: 0, inputMiss: 0, output: 0, outcome: "retryable" });
    expect(() => reserve(l, hashes[0], now + 4)).toThrow("attempt-limit");
  });
  it("keeps unknown billing and crashed reservations across reopening and both period boundaries", () => {
    const p = path(), cfg = monthEndConfig(), l = open(p, cfg), start = Date.parse("2026-09-30T15:59:59Z");
    const r = reserve(l, hashes[0], start); l.unknown(r.id, "network-timeout");
    reserve(l, hashes[1], start); l.close();
    const next = open(p, cfg), later = Date.parse("2026-09-30T16:00:01Z"), report = next.report(later);
    expect(report).toMatchObject({ inFlight: 2, unknownRequests: 1, reservedNanoCny: 8_096_000 });
    expect(report.daily.reservedNanoCny).toBe(8_096_000);
    expect(report.monthly.reservedNanoCny).toBe(8_096_000);
    expect(() => reserve(next, hashes[0], later)).toThrow("already-reserved");
    expect(() => reserve(next, hashes[1], later)).toThrow("already-reserved");
  });
  it("shares project concurrency with different batches and leaves unknown requests occupying slots", () => {
    const p = path(), a = open(p), b = open(p, config({ batchId: "sample-2" }));
    const r = reserve(a); a.unknown(r.id, "timeout"); reserve(b, hashes[1]); reserve(a, hashes[2]);
    expect(() => reserve(b, hashes[3])).toThrow("concurrency-limit");
    settle(a, r.id); expect(reserve(b, hashes[3]).attempt).toBe(1);
  });
  it("atomically shares reservations across simultaneous separate Node processes", async () => {
    const p = path(); open(p).close();
    const moduleUrl = new URL("../src/model-budget.ts", import.meta.url).href;
    const results = await Promise.all(hashes.slice(0, 8).map(async requestHash => {
      const script = `import { BudgetLedger } from ${JSON.stringify(moduleUrl)}; const l=new BudgetLedger(${JSON.stringify(p)},${JSON.stringify(config())}); try { l.reserve(${JSON.stringify({ requestHash, now, inputTokensBound: 1000, maxOutputTokens: 256 })}); console.log('reserved'); } catch(e) { console.log(e.message); } finally { l.close(); }`;
      const result = await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: { ...process.env, NODE_NO_WARNINGS: "1" } });
      return result.stdout.trim();
    }));
    expect(results.filter(r => r === "reserved")).toHaveLength(3);
    expect(results.filter(r => r === "budget-concurrency-limit")).toHaveLength(5);
    expect(open(p).report(now).inFlight).toBe(3);
  }, 20_000);
  it("atomically rejects simultaneous cross-process spending beyond the shared money cap", async () => {
    const p = path(), c = config({ dailyLimitCny: 0.009 }); open(p, c).close();
    const moduleUrl = new URL("../src/model-budget.ts", import.meta.url).href;
    const results = await Promise.all(hashes.slice(0, 8).map(async requestHash => {
      const script = `import { BudgetLedger } from ${JSON.stringify(moduleUrl)}; const l=new BudgetLedger(${JSON.stringify(p)},${JSON.stringify(c)}); try { l.reserve(${JSON.stringify({ requestHash, now, inputTokensBound: 1000, maxOutputTokens: 256 })}); console.log('reserved'); } catch(e) { console.log(e.message); } finally { l.close(); }`;
      return (await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: { ...process.env, NODE_NO_WARNINGS: "1" } })).stdout.trim();
    }));
    expect(results.filter(r => r === "reserved")).toHaveLength(2);
    expect(results.filter(r => r === "budget-exhausted")).toHaveLength(6);
    expect(open(p, c).report(now).daily.remainingNanoCny).toBe(904_000);
  }, 20_000);
  it("preserves a reservation when its process exits abruptly", async () => {
    const p = path(), moduleUrl = new URL("../src/model-budget.ts", import.meta.url).href;
    const script = `import { BudgetLedger } from ${JSON.stringify(moduleUrl)}; const l=new BudgetLedger(${JSON.stringify(p)},${JSON.stringify(config())}); l.reserve(${JSON.stringify({ requestHash: hashes[0], now, inputTokensBound: 1000, maxOutputTokens: 256 })}); process.exit(1);`;
    await expect(run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: { ...process.env, NODE_NO_WARNINGS: "1" } })).rejects.toThrow();
    const l = open(p); expect(l.report(now).reservedNanoCny).toBe(4_048_000);
    expect(() => reserve(l)).toThrow("already-reserved");
  });
  it("charges a retry to its actual new Beijing day and month without erasing the first attempt", () => {
    const l = open(path(), monthEndConfig()), old = Date.parse("2026-09-30T15:59:58Z"), next = Date.parse("2026-09-30T16:00:01Z");
    const first = reserve(l, hashes[0], old); settle(l, first.id, old + 1, { outcome: "retryable" });
    const second = reserve(l, hashes[0], next); settle(l, second.id, next + 1);
    expect(l.report(old).monthly.spentNanoCny).toBe(602_000);
    expect(l.report(next).monthly.spentNanoCny).toBe(602_000);
    expect(l.report(next).batch.spentNanoCny).toBe(1_204_000);
  });
  it.each(["daily", "monthly", "batch"])("stops on %s money cap before dispatch", kind => {
    const l = open(path(), config({ [kind + "LimitCny"]: 0.006 }));
    const r = reserve(l); settle(l, r.id, now, { inputHit: 0, inputMiss: 1000, output: 256 });
    expect(() => reserve(l, hashes[1])).toThrow("budget-exhausted");
    expect(l.report(now).requests).toBe(1);
  });
  it("does not reset daily/monthly spending with a new batch ID", () => {
    const p = path(), c = config({ dailyLimitCny: 0.006 }), a = open(p, c);
    const r = reserve(a); settle(a, r.id, now, { inputHit: 0, inputMiss: 1000, output: 256 });
    const b = open(p, { ...c, batchId: "new-batch" });
    expect(() => reserve(b, hashes[1])).toThrow("budget-exhausted");
  });
  it("does not allow reopening the same batch with expanded approval or raised limits", () => {
    const p = path(), c = config({ batchLimitCny: 0.5, approvedRequestHashes: [hashes[0]] }); open(p, c);
    expect(() => open(p, { ...c, batchLimitCny: 1 })).toThrow("approval-mismatch");
    expect(() => open(p, { ...c, approvedRequestHashes: hashes })).toThrow("approval-mismatch");
    expect(() => open(p, { ...c, dailyLimitCny: 4 })).toThrow("policy-mismatch");
  });
  it("uses Beijing days/months while preserving the original dispatch period for settled costs", () => {
    const l = open(path(), monthEndConfig()), old = Date.parse("2026-09-30T15:59:59Z"), next = old + 2000;
    const r = reserve(l, hashes[0], old); settle(l, r.id, next);
    expect(l.report(old).daily.spentNanoCny).toBeGreaterThan(0);
    expect(l.report(next).daily.spentNanoCny).toBe(0);
    expect(l.report(next).monthly.spentNanoCny).toBe(0);
    expect(l.report(next).batch.spentNanoCny).toBeGreaterThan(0);
  });
  it.each(["2026-09-10T22:00:00Z", "2026-09-12T02:00:00Z"])("settles off-peak usage (Beijing Friday 06:00 / Saturday 10:00) at %s", start => {
    const l = open(), at = Date.parse(start), r = reserve(l, hashes[0], at);
    expect(r.reservedNanoCny).toBe(4_048_000);
    expect(settle(l, r.id, at + 1000)).toEqual({ settled: true, estimated: false, costNanoCny: 602_000 });
  });
  it.each(["2026-09-11T02:00:00Z", "2026-09-11T06:30:00Z"])("uses peak prices (Beijing Friday 10:00 / 14:30) at %s", start => {
    const l = open(), at = Date.parse(start), r = reserve(l, hashes[0], at);
    expect(settle(l, r.id, at + 1000)).toMatchObject({ estimated: false, costNanoCny: 1_204_000 });
  });
  it("marks cross-window costs as conservative estimates, including matching endpoint windows", () => {
    const l = open(), start = Date.parse("2026-09-11T03:59:59Z"), r = reserve(l, hashes[0], start);
    expect(settle(l, r.id, Date.parse("2026-09-11T06:01:00Z"))).toEqual({ settled: true, estimated: true, costNanoCny: 1_204_000 });
  });
  it("rejects expired prices and malformed usage without releasing reservations", () => {
    const l = open(), r = reserve(l);
    expect(() => reserve(l, hashes[1], Date.parse("2027-01-01"))).toThrow("price-expired");
    expect(() => settle(l, r.id, now, { inputHit: -1 })).toThrow("token-count");
    expect(l.report(now).inFlight).toBe(1);
  });
  it.each([{ model: "deepseek-pro" }, { output: 257 }, { inputMiss: 1001 }])("persists a project halt on unexpected model/usage %j", extra => {
    const p = path(), l = open(p), r = reserve(l);
    expect(settle(l, r.id, now, extra).settled).toBe(false);
    expect(open(p).report(now)).toMatchObject({ paused: true, inFlight: 1, unknownRequests: 1 });
    expect(() => reserve(l, hashes[1])).toThrow("project-paused");
  });
  it("retains the full hold and pauses atomically when a response reaches price expiry", () => {
    const p = path(), c = config(), l = open(p, c), expiry = Date.parse(c.price.validUntil);
    const r = reserve(l, hashes[0], expiry - 1000);
    expect(settle(l, r.id, expiry)).toEqual({ settled: false, estimated: true, costNanoCny: null });
    const observer = open(p, c);
    expect(observer.report(expiry)).toMatchObject({ paused: true, pauseReason: "price-expired-during-request",
      unknownRequests: 1, reservedNanoCny: r.reservedNanoCny, settledNanoCny: 0 });
  });
  it("marks unknown usage and project halt in one transaction visible to every connection", () => {
    const p = path(), l = open(p), observer = open(p), r = reserve(l);
    l.unknownAndHalt(r.id, "authentication-or-balance");
    expect(observer.report(now)).toMatchObject({ paused: true, pauseReason: "authentication-or-balance",
      unknownRequests: 1, reservedNanoCny: r.reservedNanoCny });
    expect(() => reserve(observer, hashes[1])).toThrow("project-paused");
    expect(() => l.unknownAndHalt(r.id, "raw secret response")).toThrow("reason-code");
  });
  it("does not silently replace the approved price schedule within an existing batch", () => {
    const p = path(), c = config(); open(p, c);
    const altered = structuredClone(c); altered.price.peak.outputCnyPerMillion = 7;
    expect(() => open(p, altered)).toThrow("approval-mismatch");
  });
  it("persists authentication/credit halt across processes and rejects arbitrary response text", () => {
    const p = path(), l = open(p); l.halt("authentication-error");
    expect(open(p).report(now)).toMatchObject({ paused: true, pauseReason: "authentication-error" });
    expect(() => reserve(l)).toThrow("project-paused");
    expect(() => l.halt("Bearer secret response text")).toThrow("reason-code");
  });
  it("stores only request hashes, usage, price and safe metadata, never request bodies", () => {
    const p = path(), l = open(p), r = reserve(l); settle(l, r.id);
    const db = new DatabaseSync(p, { readOnly: true });
    const row = db.prepare("SELECT * FROM budget_requests").get()!;
    expect(row.request_hash).toBe(hashes[0]); expect(row.price_json).toContain("fixture-v1");
    expect(row).not.toHaveProperty("prompt"); expect(row).not.toHaveProperty("api_key");
    db.close();
  });
});
