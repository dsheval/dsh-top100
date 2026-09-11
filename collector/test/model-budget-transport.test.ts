import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetLedger, type BudgetConfig } from "../src/model-budget.js";
import { dispatchBudgetedModel, inspectModelRequest } from "../src/model-requests.js";
const url = "https://api.deepseek.com/chat/completions";
const now = Date.parse("2026-09-11T02:00:00Z");
const init: RequestInit = { method: "POST", body: JSON.stringify({ model: "deepseek-flash", messages: [{ role: "user", content: "给测试插件分类。" }], temperature: 0.1, max_tokens: 256, thinking: { type: "disabled" } }) };
const rate = { inputHitCnyPerMillion: 0.04, inputMissCnyPerMillion: 2, outputCnyPerMillion: 8 };
const config: BudgetConfig = { projectId: "dsh-top100", model: "deepseek-flash", batchId: "transport-test", approvedRequestHashes: [inspectModelRequest(url, init).requestHash], dailyLimitCny: 5, monthlyLimitCny: 50, batchLimitCny: 1, price: { version: "test", verifiedAt: "2026-09-11T00:00:00Z", validUntil: "2026-09-12T00:00:00Z", peak: rate, offPeak: { inputHitCnyPerMillion: 0.02, inputMissCnyPerMillion: 1, outputCnyPerMillion: 4 } } };
const dirs: string[] = [];
function ledger() { const dir = mkdtempSync(join(tmpdir(), "model-transport-")); dirs.push(dir); return new BudgetLedger(join(dir, "budget.sqlite"), config); }
function success(extra: object = {}) { return new Response(JSON.stringify({ model: "deepseek-flash", usage: { prompt_tokens: 20, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 15, completion_tokens: 10, total_tokens: 30 }, choices: [{ message: { content: '{"categories":[]}' } }], ...extra })); }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });
describe("budgeted model transport", () => {
  it("settles usage before returning readable data and prevents a completed request from being sent twice", async () => {
    const db = ledger(), transport = vi.fn(async () => success());
    try {
      const response = await dispatchBudgetedModel(db, url, init, transport, () => now);
      expect((await response.json()).choices).toHaveLength(1);
      expect(transport.mock.calls[0][1]).toMatchObject({ redirect: "error" });
      await expect(dispatchBudgetedModel(db, url, init, transport, () => now)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { db.close(); }
  });
  it.each(["timeout", "missing-usage", "wrong-model", "authentication", "invalid-json", "output-overrun"])("retains reservation and blocks duplicate dispatch after %s", async mode => {
    const db = ledger();
    const transport = vi.fn(async () => {
      if (mode === "timeout") throw new Error("DO-NOT-LOG-SECRET");
      if (mode === "authentication") return new Response("DO-NOT-LOG-SECRET", { status: 401 });
      if (mode === "invalid-json") return new Response("DO-NOT-LOG-SECRET");
      if (mode === "missing-usage") return success({ usage: undefined });
      if (mode === "wrong-model") return success({ model: "unapproved-model" });
      return success({ usage: { prompt_tokens: 20, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 15, completion_tokens: 300, total_tokens: 320 } });
    });
    try {
      await expect(dispatchBudgetedModel(db, url, init, transport, () => now)).rejects.toThrow("model-request-stopped-inspect-budget-report");
      await expect(dispatchBudgetedModel(db, url, init, transport, () => now)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(db.report(now))).not.toContain("DO-NOT-LOG-SECRET");
    } finally { db.close(); }
  });
  it("rejects new scope, non-Flash models, thinking, oversize output, tools and alternate endpoints before transport", async () => {
    const db = ledger(), transport = vi.fn(async () => success());
    try {
      for (const patch of [{ model: "deepseek-v4-pro" }, { thinking: { type: "enabled" } }, { max_tokens: 4096 }, { tools: [] }, { messages: [{ role: "user", content: "another request" }] }]) {
        await expect(dispatchBudgetedModel(db, url, { ...init, body: JSON.stringify({ ...JSON.parse(init.body as string), ...patch }) }, transport, () => now)).rejects.toThrow();
      }
      await expect(dispatchBudgetedModel(db, "https://example.invalid/chat/completions", init, transport, () => now)).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    } finally { db.close(); }
  });
  it("allows only one extra attempt after explicit usage-accounted retryable failure", async () => {
    const db = ledger();
    const transport = vi.fn(async () => new Response(await success().text(), { status: 429 }));
    try {
      await dispatchBudgetedModel(db, url, init, transport, () => now);
      await dispatchBudgetedModel(db, url, init, transport, () => now);
      await expect(dispatchBudgetedModel(db, url, init, transport, () => now)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(2);
    } finally { db.close(); }
  });
});
