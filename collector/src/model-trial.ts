/** Run only a separately approved, frozen request list. Never changes catalog data. */
import "./env.js";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { extractJson, extractCategoriesJson } from "./llm.js";
import { BudgetLedger } from "./model-budget.js";
import { requestModel, inspectModelRequest, loadApprovedModelBudget, modelRequestsEnabled, MODEL_LEDGER_PATH, MODEL_REQUESTS_PAUSED } from "./model-requests.js";
export interface TrialRequest {
  fullName: string;
  kind: "description" | "categories";
  body: object;
  requestHash: string;
  inputTokensBound: number;
  maxOutputTokens: number;
}
export interface ModelTrialPlan { schemaVersion: 1; batchId: string; requests: TrialRequest[]; }
export function trialPlanHash(plan: ModelTrialPlan): string {
  return createHash("sha256").update(JSON.stringify({ schemaVersion: plan.schemaVersion, batchId: plan.batchId,
    requests: plan.requests.map(r => ({ fullName: r.fullName, kind: r.kind, requestHash: r.requestHash, inputTokensBound: r.inputTokensBound, maxOutputTokens: r.maxOutputTokens })) })).digest("hex");
}
export function validateTrialApproval(plan: ModelTrialPlan, config: { batchId: string; approvedRequestHashes: string[]; approvedPlanHash?: string }): void {
  validateTrialPlan(plan);
  if (config.batchId !== plan.batchId || config.approvedPlanHash !== trialPlanHash(plan)
    || JSON.stringify([...config.approvedRequestHashes].sort()) !== JSON.stringify(plan.requests.map(r => r.requestHash).sort())) throw new Error("model-trial-scope-not-approved");
}
export function validateTrialPlan(value: ModelTrialPlan): void {
  if (value?.schemaVersion !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value.batchId)
    || !Array.isArray(value.requests) || value.requests.length < 1 || value.requests.length > 30) throw new Error("invalid-model-trial-plan");
  const seen = new Set<string>();
  for (const item of value.requests) {
    if (!item || typeof item.fullName !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(item.fullName)
      || !["description", "categories"].includes(item.kind) || seen.has(item.fullName.toLowerCase())) throw new Error("invalid-model-trial-item");
    seen.add(item.fullName.toLowerCase());
    const inspected = inspectModelRequest("https://api.deepseek.com/chat/completions", { method: "POST", body: JSON.stringify(item.body) });
    if (inspected.requestHash !== item.requestHash || inspected.inputTokensBound !== item.inputTokensBound || inspected.maxOutputTokens !== item.maxOutputTokens) throw new Error("model-trial-payload-changed");
  }
}
export async function modelTrialCli(args: string[]): Promise<void> {
  const [input, output, mode] = args;
  if (!input || !output || !["--dry-run", "--run"].includes(mode) || args.length !== 3) throw new Error("Usage: model-trial.ts PLAN OUTPUT_DIR --dry-run|--run");
  const plan = JSON.parse(readFileSync(resolve(input), "utf8")) as ModelTrialPlan;
  validateTrialPlan(plan);
  if (mode === "--dry-run") {
    console.log(JSON.stringify({ batchId: plan.batchId, requests: plan.requests.length, inputTokensBound: plan.requests.reduce((n, r) => n + r.inputTokensBound, 0), maxOutputTokens: plan.requests.reduce((n, r) => n + r.maxOutputTokens, 0), realRequests: 0 }));
    return;
  }
  if (!modelRequestsEnabled()) throw new Error(MODEL_REQUESTS_PAUSED);
  const config = loadApprovedModelBudget();
  validateTrialApproval(plan, config);
  // A fresh output folder prevents overwriting another run; the shared ledger also
  // prevents paying again after a lost response or interrupted process.
  mkdirSync(resolve(output), { recursive: false, mode: 0o700 });
  mkdirSync(resolve(MODEL_LEDGER_PATH, ".."), { recursive: true, mode: 0o700 });
  const ledger = new BudgetLedger(MODEL_LEDGER_PATH, config);
  const results: object[] = [];
  const save = () => writeFileSync(join(resolve(output), "result.json"), JSON.stringify({ batchId: plan.batchId, model: "deepseek-flash", thinking: "disabled", results, budget: ledger.report(Date.now()), catalogChanged: false }, null, 2) + "\n", { mode: 0o600 });
  try {
    for (const item of plan.requests) {
      const before = ledger.report(Date.now());
      if (before.paused || before.unknownRequests > 0 || before.inFlight > 0) break;
      try {
        // Trial is deliberately sequential with no automatic retry. The project
        // transport still protects concurrent requests from every other entry point.
        const res = await requestModel({}, "https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY!.trim()}` }, body: JSON.stringify(item.body) });
        if (!res.ok) { results.push({ fullName: item.fullName, kind: item.kind, status: "http-error", httpStatus: res.status }); save(); break; }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        const parsed = typeof content === "string" ? item.kind === "description" ? extractJson(content) : extractCategoriesJson(content).slice(0, 1) : null;
        const valid = parsed && (!Array.isArray(parsed) || parsed.length === 1);
        results.push({ fullName: item.fullName, kind: item.kind, status: valid ? "candidate-needs-review" : "invalid-content", result: valid ? parsed : null });
      } catch { results.push({ fullName: item.fullName, kind: item.kind, status: "stopped-inspect-budget-report" }); save(); break; }
      save();
    }
    save();
  } finally { ledger.close(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  modelTrialCli(process.argv.slice(2)).catch(() => { console.error("Model trial stopped; check the approved plan, private configuration and budget report."); process.exitCode = 1; });
}
