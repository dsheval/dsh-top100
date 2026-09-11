import { describe, expect, it } from "vitest";
import { validateTrialPlan, validateTrialApproval, trialPlanHash, type ModelTrialPlan } from "../src/model-trial.js";
import { buildClassificationRequest } from "../src/llm.js";
import { inspectModelRequest } from "../src/model-requests.js";
const body = buildClassificationRequest({ name: "fixture/plugin", description: "Search papers", readmeSummary: "Search and read academic papers.", topics: [] }, "deepseek-flash");
const shape = inspectModelRequest("https://api.deepseek.com/chat/completions", { method: "POST", body: JSON.stringify(body) });
const plan: ModelTrialPlan = { schemaVersion: 1, batchId: "sample-test", requests: [{ fullName: "fixture/plugin", kind: "categories", body, ...shape }] };
describe("frozen trial plan", () => {
  it("binds the exact request, input bound and model without calling an API", () => {
    expect(() => validateTrialPlan(plan)).not.toThrow();
    const changed = structuredClone(plan); (changed.requests[0].body as any).model = "deepseek-v4-pro";
    expect(() => validateTrialPlan(changed)).toThrow();
    const changedSize = structuredClone(plan); changedSize.requests[0].inputTokensBound--;
    expect(() => validateTrialPlan(changedSize)).toThrow("model-trial-payload-changed");
  });
  it("binds the project identity and result kind in private approval, not just the paid payload", () => {
    const approval = { batchId: plan.batchId, approvedRequestHashes: [shape.requestHash], approvedPlanHash: trialPlanHash(plan) };
    expect(() => validateTrialApproval(plan, approval)).not.toThrow();
    for (const patch of [{ fullName: "other/project" }, { kind: "description" as const }]) {
      const altered = structuredClone(plan); Object.assign(altered.requests[0], patch);
      expect(() => validateTrialPlan(altered)).not.toThrow();
      expect(() => validateTrialApproval(altered, approval)).toThrow("not-approved");
    }
  });
  it("rejects duplicate targets and unbounded trial sizes", () => {
    expect(() => validateTrialPlan({ ...plan, requests: [plan.requests[0], plan.requests[0]] })).toThrow();
    expect(() => validateTrialPlan({ ...plan, requests: Array(31).fill(plan.requests[0]) })).toThrow();
  });
});
