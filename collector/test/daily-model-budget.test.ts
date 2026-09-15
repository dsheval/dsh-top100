import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindModelBudget, canRequestModel, inspectModelRequest, loadApprovedModelBudget, modelRequestsEnabled,
  requestModel, withDailyModelRequest, isDailyBoardRun, dailyBoardDescriptionsEnabled, type ApprovedModelBudget } from "../src/model-requests.js";
import { BudgetLedger } from "../src/model-budget.js";
import { buildTranslationRequest, buildClassificationRequest } from "../src/llm.js";

const dirs: string[] = [];
const input = { name: "acme/papers", description: "Search academic papers.", readmeSummary: null, topics: [] };
const body = buildTranslationRequest(input, "deepseek-flash");
const request = (value = body) => inspectModelRequest("https://api.deepseek.com/chat/completions", { method: "POST", body: JSON.stringify(value) });
function configure() {
  const dir = mkdtempSync(join(tmpdir(), "daily-budget-test-"));dirs.push(dir);
  const now = Date.now();
  const config: ApprovedModelBudget = { schemaVersion: 1, approval: "approved", protectionVersion: "model-budget-v1", scope: "daily-source-changes",
    projectId: "dsh-top100", model: "deepseek-flash", batchId: "daily-policy", approvedRequestHashes: ["a".repeat(64)],
    dailyLimitCny: 5, monthlyLimitCny: 50, batchLimitCny: 1,
    price: { version: "test-price", verifiedAt: new Date(now-1000).toISOString(), validUntil: new Date(now+86_400_000).toISOString(),
      peak: { inputHitCnyPerMillion: 0.04, inputMissCnyPerMillion: 2, outputCnyPerMillion: 8 },
      offPeak: { inputHitCnyPerMillion: 0.02, inputMissCnyPerMillion: 1, outputCnyPerMillion: 4 } } };
  const path = join(dir, "config.json");writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
  vi.stubEnv("DSH_MODEL_REQUESTS_ENABLED", "1");vi.stubEnv("DEEPSEEK_API_KEY", "fake-local-test-key");vi.stubEnv("DSH_MODEL_BUDGET_CONFIG", path);
  return { dir, config, now };
}
afterEach(() => { vi.restoreAllMocks();vi.unstubAllEnvs();for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe("daily requests share the existing money guard", () => {
  it("blocks a scoped classification request during scheduler startup before transport", async () => {
    configure();vi.stubEnv("DSH_DAILY_UPDATE", "0");
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network"));
    const classification = buildClassificationRequest(input, "deepseek-flash");
    expect(modelRequestsEnabled()).toBe(false);
    expect(withDailyModelRequest(classification, () => canRequestModel())).toBe(false);
    await expect(withDailyModelRequest(classification, () => requestModel({}, "https://api.deepseek.com/chat/completions", {
      method: "POST", body: JSON.stringify(classification),
    }))).rejects.toThrow("Model requests are paused");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("DSH_DAILY_UPDATE", "1");
    expect(modelRequestsEnabled()).toBe(true);
    expect(withDailyModelRequest(classification, () => canRequestModel())).toBe(true);
  });
  it("requires explicit board policy and a scheduled run; startup and auxiliary work stay blocked", () => {
    const { dir, config } = configure();
    vi.stubEnv("DSH_DAILY_UPDATE", "1"); expect(isDailyBoardRun()).toBe(false);
    writeFileSync(join(dir, "config.json"), JSON.stringify({ ...config, boardDescriptions: "hot-rising-top100" }));
    expect(dailyBoardDescriptionsEnabled()).toBe(true); expect(isDailyBoardRun()).toBe(true);
    expect(canRequestModel()).toBe(false);
    vi.stubEnv("DSH_DAILY_UPDATE", "0"); expect(isDailyBoardRun()).toBe(false);
    writeFileSync(join(dir, "config.json"), JSON.stringify({ ...config, boardDescriptions: "all-catalog" }));
    expect(dailyBoardDescriptionsEnabled()).toBe(false);
  });
  it("requires private approved policy and a scoped callback", () => {
    configure();expect(loadApprovedModelBudget().scope).toBe("daily-source-changes");expect(modelRequestsEnabled()).toBe(true);
    expect(canRequestModel()).toBe(false);
    expect(withDailyModelRequest(body, () => canRequestModel())).toBe(true);
    expect(canRequestModel()).toBe(false);
  });
  it("blocks unscoped bulk/auxiliary requests and a changed payload before transport", async () => {
    configure();const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network"));
    const init = { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer fake-local-test-key" } };
    await expect(requestModel({}, "https://api.deepseek.com/chat/completions", init)).rejects.toThrow("outside-scope");
    await expect(withDailyModelRequest(body, () => requestModel({}, "https://api.deepseek.com/chat/completions", {
      ...init, body: JSON.stringify(buildClassificationRequest(input, "deepseek-flash")),
    }))).rejects.toThrow("outside-scope");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not open a daily scope for Pro, thinking or oversized output", () => {
    configure();
    for (const changed of [{ ...body, model: "deepseek-v4-pro" }, { ...body, thinking: { type: "enabled" } }, { ...body, max_tokens: 4096 }]) {
      expect(() => withDailyModelRequest(changed, () => undefined)).toThrow("not-approved");
    }
  });
  it("shares project costs across daily request batches and retains duplicate protection", () => {
    const { dir, config, now } = configure(), first = request();
    const a = new BudgetLedger(join(dir, "ledger.sqlite"), bindModelBudget(config, first.requestHash, first.requestHash));
    const reserved = a.reserve({ ...first, now });a.settle(reserved.id, { inputHit: 0, inputMiss: 1000, output: 100, model: "deepseek-flash", now });
    const spent = a.report(now).daily.spentNanoCny;expect(spent).toBeGreaterThan(0);a.close();
    const second = request(buildTranslationRequest({ ...input, name: "acme/new" }, "deepseek-flash"));
    const b = new BudgetLedger(join(dir, "ledger.sqlite"), bindModelBudget(config, second.requestHash, second.requestHash));
    expect(b.report(now).daily.spentNanoCny).toBe(spent);expect(b.report(now).monthly.spentNanoCny).toBe(spent);b.close();
    const again = new BudgetLedger(join(dir, "ledger.sqlite"), bindModelBudget(config, first.requestHash, first.requestHash));
    expect(() => again.reserve({ ...first, now })).toThrow("already-reserved-or-complete");again.close();
  });
});
