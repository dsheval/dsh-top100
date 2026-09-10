import { modelRequestsEnabled } from "../src/model-requests.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshPlugin } from "@dsh-top100/schema";
import {
  carryForwardDailyCategories, dailyCategoryWorker, planDailyCategories, runDailyCategories,
  type DailyCategoryInput, type DailyCategoryState,
} from "../src/daily-categories.js";
import { bindCategoryAssignments, CATEGORY_POLICY_VERSION, categorySourceHash } from "../src/categories.js";
import { contentSourceHash } from "../src/content-source.js";
import * as editorial from "../src/editorial.js";
import * as llm from "../src/llm.js";

const now = Date.parse("2026-09-10T00:00:00Z");
const day = 86_400_000;
const suggestions = [{ id: "knowledge" as const, confidence: 0.95, evidence: "检索学术论文与引用来源" }];
function entry(index = 1): DailyCategoryInput {
  return { fullName: `sample/research-${index}`, name: `research-${index}`, type: "cordis-plugin",
    description: "Search academic papers and retrieve their citations.", readmeSummary: "Search published papers and their references.",
    topics: [], stars: 1000 - index, install: { method: "pnpm-profile", packageName: `research-${index}`, needsConfig: false }, categories: [] };
}
function assigned(input: DailyCategoryInput, source: "manual" | "deepseek" = "deepseek") {
  return bindCategoryAssignments({ ...input, description: input.description ?? "", install: input.install ?? undefined }, [{ ...suggestions[0], source }]);
}
function completed(input: DailyCategoryInput): DailyCategoryState {
  return { schemaVersion: 1, jobs: { [input.fullName.toLowerCase()]: {
    sourceHash: contentSourceHash(input, "categories"), policyVersion: CATEGORY_POLICY_VERSION,
    status: "complete", attempts: 1, categories: assigned(input),
  } } };
}
function held(): DailyCategoryInput {
  return { ...entry(), install: { method: "pnpm-profile", packageName: "@deepseek-ai/dsh-root", needsConfig: false } };
}
afterEach(() => vi.restoreAllMocks());

describe("daily source-bound category planning", () => {
  it("keeps same-source categories and leaves pending attempts untouched during the model pause", async () => {
    const input = entry();
    const previous = { ...input, categories: assigned(input) };
    const pending = entry(2);
    carryForwardDailyCategories([input as DshPlugin], new Map([[input.fullName, previous as DshPlugin]]));
    const plan = planDailyCategories([input, pending], { now });
    const worker = vi.fn(async () => suggestions);
    await runDailyCategories(plan, { model: "mock", worker, limit: modelRequestsEnabled() ? 200 : 0 });
    expect(input.categories).toEqual(previous.categories);
    expect(plan.state.jobs[input.fullName].status).toBe("complete");
    expect(plan.state.jobs[pending.fullName]).toMatchObject({ status: "pending", attempts: 0 });
    expect(worker).not.toHaveBeenCalled();
  });

  it("prefers matching editorial categories over valid existing model content, even during a hold", () => {
    const input = held();
    input.categories = assigned(input);
    const review = assigned(input, "manual");
    vi.spyOn(editorial, "reviewedCategories").mockReturnValue(review);
    const plan = planDailyCategories([input], { now });
    expect(input.categories).toEqual(review);
    expect(plan.state.jobs[input.fullName]).toMatchObject({ status: "complete", categories: review });
    expect(plan.ready).toHaveLength(0);
  });

  it.each(["hold", "missing-source"])("blocks both caches and model calls for %s", async mode => {
    const input = mode === "hold" ? held() : { ...entry(), description: null, readmeSummary: null };
    const previous = completed(input);
    const cache = new Map([[input.fullName, { sourceHash: contentSourceHash(input, "categories"), categories: assigned(input) }]]);
    const plan = planDailyCategories([input], { now, previous, cache });
    expect(plan.state.jobs[input.fullName].status).toBe(mode === "hold" ? "review-required" : "missing-source");
    expect(input.categories).toEqual([]);
    const worker = vi.fn(async () => suggestions);
    expect(await runDailyCategories(plan, { model: "mock", worker })).toMatchObject({ attempted: 0 });
    expect(worker).not.toHaveBeenCalled();
  });

  it.each(["hold", "missing-source"])("preserves valid existing content for %s", mode => {
    const input = mode === "hold" ? held() : { ...entry(), description: null, readmeSummary: null };
    input.categories = assigned(input);
    expect(planDailyCategories([input], { now }).state.jobs[input.fullName].status).toBe("complete");
  });

  it("does not use the root description or topics as evidence for an undocumented subpackage", () => {
    const input = { ...entry(), topics: ["memory", "search"], readmeSummary: null,
      install: { method: "pnpm-profile" as const, packageName: "@sample/client", repositoryPath: "packages/client", needsConfig: false } };
    const plan = planDailyCategories([input], { now });
    expect(plan.state.jobs[input.fullName].status).toBe("review-required");
    expect(plan.ready).toHaveLength(0);
    expect(input.categories).toEqual([]);
  });

  it("restores an unchanged completed job without rebinding assignments", () => {
    const input = entry();
    const previous = completed(input);
    const plan = planDailyCategories([input], { previous, now });
    expect(input.categories).toEqual(previous.jobs[input.fullName].categories);
    expect(plan.state.jobs[input.fullName]).toMatchObject({ status: "complete", attempts: 1 });
    expect(plan.ready).toHaveLength(0);
  });

  it("never overwrites independent current manual content with a completed model job", () => {
    const input = entry();
    input.categories = assigned(input, "manual");
    planDailyCategories([input], { previous: completed(input), now });
    expect(input.categories[0].source).toBe("manual");
  });

  it.each(["description", "readmeSummary", "type", "name", "topics", "package", "path"])("invalidates old source/cache after a %s change", field => {
    const input = entry();
    const previous = completed(input);
    const changed = structuredClone(input);
    if (field === "description") changed.description += " Updated purpose.";
    if (field === "readmeSummary") changed.readmeSummary += " New evidence.";
    if (field === "type") changed.type = "skill";
    if (field === "name") changed.name = "new-name";
    if (field === "topics") changed.topics = ["new-topic"];
    if (field === "package") changed.install!.packageName = "other-package";
    if (field === "path") changed.install!.repositoryPath = "plugins/other-package";
    const cache = new Map([[input.fullName, { sourceHash: previous.jobs[input.fullName].sourceHash, categories: assigned(input) }]]);
    const plan = planDailyCategories([changed], { previous, cache, now });
    expect(plan.state.jobs[input.fullName].sourceHash).not.toBe(previous.jobs[input.fullName].sourceHash);
    expect(plan.state.jobs[input.fullName].status).not.toBe("complete");
    expect(plan.state.jobs[input.fullName].attempts).toBe(0);
    expect(changed.categories?.some(category => category.source === "deepseek")).toBe(false);
  });

  it("rejects both a legacy outer cache hash and stale inner assignment hashes", () => {
    for (const innerStale of [false, true]) {
      const input = entry();
      const categories = assigned(input);
      if (innerStale) categories[0].sourceHash = "old";
      const sourceHash = innerStale ? contentSourceHash(input, "categories") : categorySourceHash({ ...input, description: input.description ?? "", install: input.install ?? undefined });
      const plan = planDailyCategories([input], { now, cache: new Map([[input.fullName, { sourceHash, categories }]]) });
      expect(plan.state.jobs[input.fullName].status).toBe("pending");
    }
  });

  it("invalidates a previous policy and known old input categories after an identity-only change", () => {
    const original = entry();
    const oldPolicy = completed(original);
    oldPolicy.jobs[original.fullName].policyVersion--;
    oldPolicy.jobs[original.fullName].categories![0].policyVersion!--;
    expect(planDailyCategories([entry()], { previous: oldPolicy, now }).ready).toHaveLength(1);
    const previous = completed(original);
    const changed = { ...entry(), type: "skill", categories: previous.jobs[original.fullName].categories };
    expect(planDailyCategories([changed], { previous, now }).ready).toHaveLength(1);
    const review = assigned(changed, "manual");
    vi.spyOn(editorial, "reviewedCategories").mockReturnValue(review);
    expect(planDailyCategories([changed], { previous, now }).ready).toHaveLength(0);
    expect(changed.categories).toEqual(review);
  });

  it("migrates unchanged full previous sources without trusting incomplete SQLite hashes", () => {
    const input = entry();
    const previous = { ...entry(), categories: assigned(input) };
    carryForwardDailyCategories([input as DshPlugin], new Map([[input.fullName, previous as DshPlugin]]));
    expect(input.categories).toEqual(previous.categories);
    expect(planDailyCategories([input], { now }).ready).toHaveLength(0);
  });

  it("restores authoritative previous categories over current rule fallback but keeps independent manual categories", () => {
    const input = entry();
    const previous = { ...entry(), categories: assigned(input) };
    input.categories = [{ ...assigned(input)[0], source: "rule-fallback", confidence: 0.54 }];
    carryForwardDailyCategories([input as DshPlugin], new Map([[input.fullName, previous as DshPlugin]]));
    expect(input.categories[0].source).toBe("deepseek");
    input.categories = assigned(input, "manual");
    carryForwardDailyCategories([input as DshPlugin], new Map([[input.fullName, previous as DshPlugin]]));
    expect(input.categories[0].source).toBe("manual");
  });

  it("clears known old copied categories when full source identity changes, while preserving independent current content", () => {
    const original = entry();
    original.categories = assigned(original);
    const changed = { ...structuredClone(original), type: "skill" };
    const previous = new Map([[original.fullName, original as DshPlugin]]);
    carryForwardDailyCategories([changed as DshPlugin], previous);
    expect(changed.categories).toEqual([]);
    changed.categories = assigned(changed, "manual");
    carryForwardDailyCategories([changed as DshPlugin], previous);
    expect(changed.categories[0].source).toBe("manual");
  });

  it.each(["type", "package", "path", "description", "stale-assignment"])("does not carry categories across %s", field => {
    const input = entry();
    const previous = { ...structuredClone(input), categories: assigned(input) };
    if (field === "type") previous.type = "skill";
    if (field === "package") previous.install!.packageName = "other-package";
    if (field === "path") previous.install!.repositoryPath = "plugins/other";
    if (field === "description") previous.description += " Different source.";
    if (field === "stale-assignment") previous.categories[0].sourceHash = "old";
    carryForwardDailyCategories([input as DshPlugin], new Map([[input.fullName, previous as DshPlugin]]));
    expect(input.categories).toEqual([]);
  });

  it.each(["held", "missing"])("preserves same-source complete market content through discovery for %s, without another worker", async mode => {
    const input = mode === "held" ? held() : { ...entry(), description: null, readmeSummary: null };
    const previous = { ...structuredClone(input), categories: assigned(input) };
    carryForwardDailyCategories([input as DshPlugin], new Map([[input.fullName, previous as DshPlugin]]));
    expect(input.categories).toEqual(previous.categories);
    const plan = planDailyCategories([input], { now });
    expect(plan.state.jobs[input.fullName].status).toBe("complete");
    const worker = vi.fn(async () => suggestions);
    await runDailyCategories(plan, { model: "mock", worker });
    expect(worker).not.toHaveBeenCalled();
  });
});

describe("daily category attempts and persistence", () => {
  it("uses one HTTP attempt, a 120-second timeout and thinking enabled", async () => {
    const classify = vi.spyOn(llm, "classifyWithDeepSeek").mockResolvedValue(suggestions);
    const input = { ...entry(), description: null, readmeSummary: null };
    await dailyCategoryWorker({ apiKey: "mock", baseURL: "https://invalid.example", model: "mock" })(input);
    expect(classify).toHaveBeenCalledWith(expect.objectContaining({ name: input.fullName, description: "", readmeSummary: null }),
      expect.objectContaining({ timeoutMs: 120_000, maxAttempts: 1, thinking: "enabled" }));
  });

  it("persists an attempt before dispatch, then stores source-bound success for a restart", async () => {
    const input = entry();
    const plan = planDailyCategories([input], { now });
    const saved: DailyCategoryState[] = [];
    await runDailyCategories(plan, { model: "mock", now: () => now,
      onProgress: () => saved.push(structuredClone(plan.state)),
      worker: async () => {
        expect(saved[0].jobs[input.fullName]).toMatchObject({ status: "retry", attempts: 1, nextAttemptAt: new Date(now + day).toISOString() });
        expect(planDailyCategories([entry()], { now, previous: saved[0] }).ready).toHaveLength(0);
        return suggestions;
      } });
    expect(saved.at(-1)!.jobs[input.fullName]).toMatchObject({ status: "complete", attempts: 1 });
    expect(saved.at(-1)!.jobs[input.fullName].nextAttemptAt).toBeUndefined();
    expect(planDailyCategories([entry()], { now, previous: saved.at(-1) }).ready).toHaveLength(0);
  });

  it("backs off failed and empty results for 1/2/4/7 days without persisting provider errors", async () => {
    let previous: DailyCategoryState | undefined;
    let clock = now;
    for (const [i, delay] of [1, 2, 4, 7, 7].entries()) {
      const input = entry();
      const plan = planDailyCategories([input], { previous, now: clock });
      expect(plan.ready).toHaveLength(1);
      await runDailyCategories(plan, { model: "mock", now: () => clock, worker: async () => {
        if (i % 2 === 0) throw new Error("secret response body");
        return [];
      } });
      const job = plan.state.jobs[input.fullName];
      expect(job).toMatchObject({ status: "retry", attempts: i + 1, nextAttemptAt: new Date(clock + delay * day).toISOString() });
      expect(JSON.stringify(plan.state)).not.toContain("secret response body");
      previous = plan.state;
      expect(planDailyCategories([entry()], { previous, now: clock + delay * day - 1 }).ready).toHaveLength(0);
      clock += delay * day;
    }
  });

  it("prioritizes new or changed sources before high-star due failures", () => {
    const failed = entry(1);
    const changed = entry(2);
    const previous = completed(failed);
    previous.jobs[failed.fullName] = { ...previous.jobs[failed.fullName], status: "retry", categories: undefined, attempts: 4, nextAttemptAt: new Date(now).toISOString() };
    previous.jobs[changed.fullName] = { ...previous.jobs[failed.fullName], sourceHash: "old source", nextAttemptAt: new Date(now + 7 * day).toISOString() };
    const fresh = entry(3);
    const plan = planDailyCategories([failed, fresh, changed], { previous, now });
    expect(plan.ready.map(task => task.fullName)).toEqual([changed.fullName, fresh.fullName, failed.fullName]);
  });

  it("keeps priority leaderboards first, then new sources ahead of due failures within the priority group", () => {
    const failed = entry(1), fresh = entry(2), ordinary = entry(3);
    const previous = completed(failed);
    previous.jobs[failed.fullName] = { ...previous.jobs[failed.fullName], status: "retry", attempts: 1,
      categories: undefined, nextAttemptAt: new Date(now).toISOString() };
    const plan = planDailyCategories([failed, ordinary, fresh], { previous, now,
      priority: new Set([failed.fullName, fresh.fullName]) });
    expect(plan.ready.map(task => task.fullName)).toEqual([fresh.fullName, failed.fullName, ordinary.fullName]);
  });

  it("keeps the daily defaults at 200 tasks and five concurrent workers", async () => {
    const plan = planDailyCategories(Array.from({ length: 205 }, (_, i) => entry(i)), { now });
    let active = 0, peak = 0;
    const result = await runDailyCategories(plan, { model: "mock", now: () => now, worker: async () => {
      peak = Math.max(peak, ++active); await Promise.resolve(); active--; return suggestions;
    } });
    expect(result).toEqual({ attempted: 200, completed: 200, failed: 0 });
    expect(peak).toBe(5);
    expect(Object.values(plan.state.jobs).filter(job => job.status === "pending")).toHaveLength(5);
  });

  it("does not call the API after a pre-dispatch persistence failure", async () => {
    const plan = planDailyCategories([entry()], { now });
    const worker = vi.fn(async () => suggestions);
    await expect(runDailyCategories(plan, { model: "mock", worker, onProgress: () => { throw new Error("disk full"); } })).rejects.toThrow("disk full");
    expect(worker).not.toHaveBeenCalled();
  });

  it("stops taking new tasks but drains in-flight requests before surfacing a disk failure", async () => {
    const plan = planDailyCategories([entry(1), entry(2), entry(3)], { now });
    const gates: Array<(value: typeof suggestions) => void> = [];
    const worker = vi.fn(() => new Promise<typeof suggestions>(resolve => gates.push(resolve)));
    let settled = false;
    const run = runDailyCategories(plan, { model: "mock", concurrency: 2, worker,
      onProgress: task => { if (task.fullName === entry(1).fullName && task.job.status === "complete") throw new Error("disk full"); } });
    const observed = run.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    expect(worker).toHaveBeenCalledTimes(2);
    gates[0](suggestions);
    await vi.waitFor(() => expect(plan.state.jobs[entry(1).fullName].status).toBe("complete"));
    expect(settled).toBe(false);
    expect(worker).toHaveBeenCalledTimes(2);
    gates[1](suggestions);
    expect((await observed).message).toBe("disk full");
    expect(plan.state.jobs[entry(2).fullName].status).toBe("complete");
    expect(plan.state.jobs[entry(3).fullName].attempts).toBe(0);
  });
});
