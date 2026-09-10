import { modelRequestsEnabled } from "../src/model-requests.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshPlugin } from "@dsh-top100/schema";
import { prepareDailyDescriptions, runDailyDescriptions, updateDailyDescriptionCache } from "../src/daily-descriptions.js";
import { descriptionSourceHash, type DescriptionJob } from "../src/description-jobs.js";
import type { ZhEntry } from "../src/zh-util.js";
import type { ZhResult } from "../src/llm.js";
import reviews from "../../plugin/src/shared/reviewed-descriptions.json";
import holds from "../config/editorial-holds.json";

const now = Date.parse("2026-09-10T00:00:00Z");
const day = 86_400_000;
const summary: ZhResult = { descriptionZh: "搜索学术论文并整理可核对的引用来源。", tagsZh: ["学术研究"] };
const older = "检索公开资料并整理研究所需的信息。";
function source(index = 1, overrides: Partial<DshPlugin> = {}): DshPlugin {
  return { id: `fixture/research-${index}`, fullName: `fixture/research-${index}`, name: `research-${index}`, owner: "fixture", repo: `research-${index}`,
    type: "cordis-plugin", stars: 100 - index, forks: 0, openIssues: 0, language: "TypeScript",
    description: "Search academic papers and retrieve their citations.", descriptionZh: null,
    readmeSummary: "Find academic papers and check their references.", tags: ["research"], topics: ["papers"],
    curated: false, homepage: null, license: "MIT", pushedAt: "", createdAt: "", updatedAt: "", lastCheckedAt: "",
    install: { method: "pnpm-profile", packageName: `research-${index}`, needsConfig: false },
    score: { total: 0, confidence: 0, explanation: "", breakdown: { maintain: 0, practical: 0, popularity: 0, ease: 0, signal: 0 } },
    sources: [], ...overrides };
}
function prepare(sources: DshPlugin[], previous: DshPlugin[] = [], cache = new Map<string, ZhEntry>(), jobs: Record<string, DescriptionJob> = {}, priority = new Set<string>(), at = now) {
  return prepareDailyDescriptions(sources, new Map(previous.map(value => [value.id.toLowerCase(), value])), cache, jobs, priority, at);
}
function cached(entry: DshPlugin, descriptionZh = older): Map<string, ZhEntry> {
  return new Map([[entry.id, { descriptionZh, tagsZh: ["旧缓存"], summaryKey: entry.readmeSummary ?? undefined, sourceHash: descriptionSourceHash(entry) }]]);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { vi.restoreAllMocks(); });

describe("daily description source gates", () => {
  it("preserves same-source Chinese and does not spend attempts during the model pause", async () => {
    const input = source();
    const previous = source(1, { descriptionZh: summary.descriptionZh });
    const pending = source(2);
    const plan = prepare([input, pending], [previous]);
    const worker = vi.fn(async () => summary);
    await runDailyDescriptions([input, pending], plan, { limit: modelRequestsEnabled() ? 300 : 0, concurrency: 3, worker });
    expect(input.descriptionZh).toBe(previous.descriptionZh);
    expect(plan.jobs[input.id].status).toBe("complete");
    expect(plan.jobs[pending.id]).toMatchObject({ status: "pending", attempts: 0 });
    expect(worker).not.toHaveBeenCalled();
  });

  it("never dispatches any explicitly held source, including entries with source-bound manual text", async () => {
    expect(Object.keys(holds).length).toBeGreaterThan(0);
    const entries = Object.entries(holds).map(([id, hold], index) => source(index, {
      id, fullName: id, name: id.split("/").pop()!, description: hold.sourceDescription, readmeSummary: hold.sourceReadme,
      install: structuredClone(hold.sourceInstall) as DshPlugin["install"],
      ...("sourceType" in hold ? { type: hold.sourceType as DshPlugin["type"] } : {}),
    }));
    const heldCache = new Map(entries.map(entry => [entry.id, cached(entry).get(entry.id)!]));
    const plan = prepare(entries, [], heldCache);
    expect(plan.ready).toHaveLength(0);
    for (const entry of entries) {
      expect(["review-required", "complete"], entry.id).toContain(plan.jobs[entry.id].status);
      if (plan.jobs[entry.id].status === "review-required") expect(plan.jobs[entry.id].reviewReason).toBe(holds[entry.id as keyof typeof holds].reason);
      expect(entry.descriptionZh, entry.id).not.toBe(older);
    }
    const worker = vi.fn(async () => summary);
    expect(await runDailyDescriptions(entries, plan, { limit: entries.length, concurrency: 3, worker })).toEqual({ attempted: 0, completed: 0, failed: 0 });
    expect(worker).not.toHaveBeenCalled();
  });

  it("blocks dynamic root runtimes, unidentified subpackages and missing evidence without dispatch", async () => {
    const entries = [
      source(1, { install: { method: "pnpm-profile", packageName: "@deepseek-ai/dsh-root", needsConfig: false } }),
      source(2, { install: { method: "pnpm-profile", packageName: "@fixture/runtime", repositoryPath: "packages/runtime", needsConfig: false } }),
      source(3, { description: "", readmeSummary: null }),
      source(4, { description: "", readmeSummary: "https://example.org/docs" }),
    ];
    const plan = prepare(entries);
    expect(entries.map(entry => plan.jobs[entry.id].status)).toEqual(["review-required", "review-required", "missing-source", "missing-source"]);
    const worker = vi.fn(async () => summary);
    await runDailyDescriptions(entries, plan, { limit: 100, concurrency: 4, worker });
    expect(worker).not.toHaveBeenCalled();
  });

  it("applies bound manual text only for the reviewed type, package and directory", () => {
    const match = Object.entries(reviews).find(([, review]) => "sourceInstall" in review && "sourceType" in review && review.sourceInstall.packageName && review.sourceInstall.repositoryPath);
    expect(match).toBeDefined();
    const [id, review] = match!;
    if (!("sourceInstall" in review) || !("sourceType" in review)) throw new Error("Bound fixture required");
    const entry = source(1, { id, fullName: id, name: id.split("/").pop()!, description: review.sourceDescription, readmeSummary: review.sourceReadme,
      type: review.sourceType as DshPlugin["type"], install: { method: "pnpm-profile", needsConfig: false,
        packageName: review.sourceInstall.packageName ?? undefined, repositoryPath: review.sourceInstall.repositoryPath ?? undefined } });
    const previous = { ...entry, descriptionZh: review.descriptionZh };
    prepare([entry]);
    expect(entry.descriptionZh).toBe(review.descriptionZh);
    for (const changed of [
      { ...previous, type: previous.type === "skill" ? "cordis-plugin" as const : "skill" as const },
      { ...previous, install: { ...previous.install, packageName: "@fixture/other" } },
      { ...previous, install: { ...previous.install, repositoryPath: "packages/other" } },
    ]) {
      prepare([changed], [previous], cached(previous, review.descriptionZh));
      expect(changed.descriptionZh).not.toBe(review.descriptionZh);
    }
  });
});

describe("daily description cache migration and identity", () => {
  it("preserves complete same-source market tags when a fixed review restores a cold-cache collection", () => {
    const id = "anywhere-labs/dsh-desktop";
    const review = reviews[id];
    const topics = ["dsh-plugin", "desktop"];
    const previous = source(1, { id, fullName: id, name: "dsh-desktop", owner: "anywhere-labs", repo: "dsh-desktop",
      description: review.sourceDescription, readmeSummary: review.sourceReadme, descriptionZh: review.descriptionZh,
      type: review.sourceType as DshPlugin["type"], topics, tags: [...topics, "桌面客户端", "插件管理", "community-market"],
      install: { method: "pnpm-profile", needsConfig: false,
        packageName: review.sourceInstall.packageName ?? undefined, repositoryPath: review.sourceInstall.repositoryPath ?? undefined } });
    const collected = { ...structuredClone(previous), descriptionZh: null, tags: [...topics] };
    const plan = prepare([collected], [previous], new Map());
    expect(collected.descriptionZh).toBe(review.descriptionZh);
    expect(collected.tags).toEqual(previous.tags);
    expect(new Set(collected.tags).size).toBe(collected.tags.length);
    expect(plan.ready).toHaveLength(0);

    const changedPackage = { ...structuredClone(previous), descriptionZh: null, tags: [...topics],
      install: { ...previous.install, packageName: "different-community-market" } };
    prepare([changedPackage], [previous], new Map());
    expect(changedPackage.tags).toEqual(topics);
    expect(changedPackage.descriptionZh).not.toBe(review.descriptionZh);
  });

  it("recovers a completed persisted job after market and derived cache writes were lost", async () => {
    const entry = source(), plan = prepare([entry]);
    const checkpoints: Record<string, DescriptionJob>[] = [];
    await runDailyDescriptions([entry], plan, { limit: 1, concurrency: 1, now: () => now,
      worker: async () => summary,
      onProgress: () => { checkpoints.push(JSON.parse(JSON.stringify(plan.jobs))); },
    });
    expect(checkpoints[0][entry.id]).toMatchObject({ status: "retry", attempts: 1, lastAttemptAt: new Date(now).toISOString() });
    const savedJobs = checkpoints.at(-1)!;
    expect(savedJobs[entry.id]).toMatchObject({ status: "complete", attempts: 1,
      descriptionZh: summary.descriptionZh, tagsZh: ["research", "学术研究"], sourceHash: descriptionSourceHash(entry), lastAttemptAt: new Date(now).toISOString() });
    const freshCollection = source();
    const recovered = prepare([freshCollection], [], new Map(), savedJobs);
    expect(freshCollection.descriptionZh).toBe(summary.descriptionZh);
    expect(freshCollection.tags).toContain("学术研究");
    expect(recovered.jobs[entry.id]).toMatchObject({ status: "complete", attempts: 1 });
    expect(recovered.ready).toHaveLength(0);
    const worker = vi.fn(async () => summary);
    expect(await runDailyDescriptions([freshCollection], recovered, { limit: 1, concurrency: 1, worker })).toEqual({ attempted: 0, completed: 0, failed: 0 });
    expect(worker).not.toHaveBeenCalled();
  });

  it("blocks completed-job replay for holds, missing evidence and changed package identities", async () => {
    const hold = holds["uckkk/dsh-jupiter"];
    const held = source(1, { id: "uckkk/dsh-jupiter", fullName: "uckkk/dsh-jupiter", name: "dsh-jupiter",
      description: hold.sourceDescription, readmeSummary: hold.sourceReadme, install: structuredClone(hold.sourceInstall) as DshPlugin["install"] });
    const missing = source(2, { description: "", readmeSummary: null });
    for (const entry of [held, missing]) {
      const completed: DescriptionJob = { sourceHash: descriptionSourceHash(entry), status: "complete", attempts: 1,
        descriptionZh: summary.descriptionZh, tagsZh: ["旧作业标签"] };
      const plan = prepare([entry], [], new Map(), { [entry.id]: completed });
      expect(entry.descriptionZh).not.toBe(summary.descriptionZh);
      expect(entry.tags).not.toContain("旧作业标签");
      expect(plan.jobs[entry.id].status).toBe(entry === held ? "review-required" : "missing-source");
      const worker = vi.fn(async () => summary);
      await runDailyDescriptions([entry], plan, { limit: 1, concurrency: 1, worker });
      expect(worker).not.toHaveBeenCalled();
    }
    const original = source();
    const completed: DescriptionJob = { sourceHash: descriptionSourceHash(original), status: "complete", attempts: 1,
      descriptionZh: summary.descriptionZh, tagsZh: ["旧作业标签"] };
    for (const changed of [
      { ...original, type: "skill" as const },
      { ...original, install: { ...original.install, packageName: "different-package" } },
      { ...original, install: { ...original.install, repositoryPath: "packages/another" } },
    ]) {
      // Exercise both a clean collection and a copied text from the old job.
      for (const carried of [null, summary.descriptionZh]) {
        const entry = { ...structuredClone(changed), descriptionZh: carried };
        const plan = prepare([entry], [], new Map(), { [entry.id]: completed });
        expect(entry.descriptionZh).not.toBe(summary.descriptionZh);
        expect(entry.tags).not.toContain("旧作业标签");
        expect(plan.jobs[entry.id].status).not.toBe("complete");
        expect(plan.jobs[entry.id].sourceHash).not.toBe(completed.sourceHash);
      }
    }
  });

  it("keeps independent current Chinese and same-source market corrections ahead of completed jobs", () => {
    const original = source();
    const completed: DescriptionJob = { sourceHash: descriptionSourceHash(original), status: "complete", attempts: 1,
      descriptionZh: older, tagsZh: ["旧作业标签"] };
    for (const entry of [
      source(1, { descriptionZh: summary.descriptionZh }),
      source(1, { descriptionZh: summary.descriptionZh, description: "A revised research workflow with new citation checks." }),
    ]) {
      const plan = prepare([entry], [], new Map(), { [entry.id]: completed });
      expect(entry.descriptionZh).toBe(summary.descriptionZh);
      expect(entry.tags).not.toContain("旧作业标签");
      expect(plan.ready).toHaveLength(0);
    }
    const collected = source();
    prepare([collected], [source(1, { descriptionZh: summary.descriptionZh })], new Map(), { [collected.id]: completed });
    expect(collected.descriptionZh).toBe(summary.descriptionZh);
  });

  it.each([null, older])("prefers the same-source current market text over older derived cache when collection carries %s", currentText => {
    const previous = source(1, { descriptionZh: summary.descriptionZh, tags: ["research", "人工标签"] });
    const entry = source(1, { descriptionZh: currentText });
    const plan = prepare([entry], [previous], cached(previous));
    expect(entry.descriptionZh).toBe(summary.descriptionZh);
    expect(entry.tags).toContain("人工标签");
    expect(plan.ready).toHaveLength(0);
  });

  it("preserves a distinct current editorial change while migrating previous market data", () => {
    const currentText = "检索论文后核对出处，并按研究主题汇总引用。";
    const previous = source(1, { descriptionZh: summary.descriptionZh });
    const entry = source(1, { descriptionZh: currentText });
    prepare([entry], [previous], cached(previous));
    expect(entry.descriptionZh).toBe(currentText);
  });

  it.each(["description", "readme", "topics", "type", "package", "directory"])("does not retain copied Chinese after %s changes", field => {
    const previous = source(1, { descriptionZh: older });
    const entry = structuredClone(previous);
    if (field === "description") entry.description += " A changed capability.";
    if (field === "readme") entry.readmeSummary += " A changed feature.";
    if (field === "topics") entry.topics.push("new-topic");
    if (field === "type") entry.type = "skill";
    if (field === "package") entry.install.packageName = "different-package";
    if (field === "directory") entry.install.repositoryPath = "packages/another";
    const plan = prepare([entry], [previous], cached(previous));
    expect(entry.descriptionZh).not.toBe(older);
    expect(plan.jobs[entry.id].status).not.toBe("complete");
    expect(plan.jobs[entry.id].sourceHash).not.toBe(descriptionSourceHash(previous));
  });

  it("never reuses legacy cache just because its README is identical", () => {
    const entry = source();
    const cache = new Map<string, ZhEntry>([[entry.id, { descriptionZh: older, tagsZh: ["旧标签"], summaryKey: entry.readmeSummary! }]]);
    const plan = prepare([entry], [], cache);
    expect(entry.descriptionZh).not.toBe(older);
    expect(entry.tags).not.toContain("旧标签");
    expect(plan.ready.map(value => value.id)).toEqual([entry.id]);
  });

  it("migrates same-source complete market entries with cold legacy caches without scheduling all of them", async () => {
    const previous = Array.from({ length: 40 }, (_, index) => source(index, { descriptionZh: summary.descriptionZh, tags: ["research", "学术研究"] }));
    const entries = previous.map(value => ({ ...structuredClone(value), descriptionZh: null }));
    const cache = new Map<string, ZhEntry>(previous.map(value => [value.id, { descriptionZh: older, tagsZh: ["旧标签"] }]));
    const plan = prepare(entries, previous, cache);
    expect(plan.ready).toHaveLength(0);
    const worker = vi.fn(async () => summary);
    await runDailyDescriptions(entries, plan, { limit: 40, concurrency: 4, worker });
    expect(worker).not.toHaveBeenCalled();
    updateDailyDescriptionCache(entries, cache);
    for (const entry of entries) expect(cache.get(entry.id)).toMatchObject({ descriptionZh: summary.descriptionZh, sourceHash: descriptionSourceHash(entry), tagsZh: ["学术研究"] });
  });

  it("reuses a complete identity-bound cache and writes complete identity after fresh success", async () => {
    const reused = source(1), fresh = source(2);
    const cache = cached(reused);
    const plan = prepare([reused, fresh], [], cache);
    expect(reused.descriptionZh).toBe(older);
    expect(plan.ready.map(value => value.id)).toEqual([fresh.id]);
    const worker = vi.fn(async () => summary);
    expect(await runDailyDescriptions([reused, fresh], plan, { limit: 10, concurrency: 2, worker, now: () => now })).toEqual({ attempted: 1, completed: 1, failed: 0 });
    updateDailyDescriptionCache([reused, fresh], cache);
    expect(cache.get(fresh.id)).toEqual({ descriptionZh: summary.descriptionZh, tagsZh: summary.tagsZh, sourceHash: descriptionSourceHash(fresh), summaryKey: fresh.readmeSummary });
    const absent = source(3);
    cache.set(absent.id, { descriptionZh: older, tagsZh: [] });
    updateDailyDescriptionCache([absent], cache);
    expect(cache.has(absent.id)).toBe(false);
  });
});

describe("daily description scheduling and persistence", () => {
  it("backs repeated failures off for 1, 2, 4, then 7 days and retries only when due", async () => {
    const entry = source();
    let jobs: Record<string, DescriptionJob> = {}, at = now;
    const worker = vi.fn(async () => null);
    for (const [index, delay] of [1, 2, 4, 7, 7].entries()) {
      const plan = prepare([entry], [], new Map(), jobs, new Set(), at);
      expect(plan.ready).toHaveLength(1);
      await runDailyDescriptions([entry], plan, { limit: 1, concurrency: 1, worker, now: () => at });
      const next = at + delay * day;
      expect(plan.jobs[entry.id]).toMatchObject({ status: "retry", attempts: index + 1, nextAttemptAt: new Date(next).toISOString() });
      expect(prepare([entry], [], new Map(), plan.jobs, new Set(), next - 1).ready).toHaveLength(0);
      jobs = plan.jobs; at = next;
    }
    expect(worker).toHaveBeenCalledTimes(5);
  });

  it.each([null, { descriptionZh: "English output", tagsZh: [] }, { descriptionZh: "中文简介待生成。", tagsZh: [] }, { descriptionZh: "汉".repeat(61), tagsZh: [] }])("keeps invalid output retryable: %j", async result => {
    const entry = source(), plan = prepare([entry]);
    const worker = vi.fn(async () => result);
    expect(await runDailyDescriptions([entry], plan, { limit: 1, concurrency: 1, worker, now: () => now })).toEqual({ attempted: 1, completed: 0, failed: 1 });
    expect(plan.jobs[entry.id]).toMatchObject({ status: "retry", attempts: 1, nextAttemptAt: new Date(now + day).toISOString() });
    expect(entry.descriptionZh).toBe("中文简介待生成。");
  });

  it("contains worker errors without leaking provider details and retains retry state", async () => {
    const entry = source(), plan = prepare([entry]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runDailyDescriptions([entry], plan, { limit: 1, concurrency: 1, now: () => now, worker: async () => { throw new Error("fixture-provider-private-body"); } });
    expect(plan.jobs[entry.id]).toMatchObject({ status: "retry", attempts: 1 });
    expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it("limits only ready work, puts priority/new attempts first and leaves non-ready jobs untouched", async () => {
    const complete = source(1, { descriptionZh: summary.descriptionZh });
    const delayed = source(2), priority = source(3, { stars: 1 }), fresh = source(4, { stars: 2 }), due = source(5, { stars: 5000 });
    const entries = [complete, delayed, due, fresh, priority];
    const jobs: Record<string, DescriptionJob> = {
      [delayed.id]: { sourceHash: descriptionSourceHash(delayed), status: "retry", attempts: 1, nextAttemptAt: new Date(now + day).toISOString() },
      [due.id]: { sourceHash: descriptionSourceHash(due), status: "retry", attempts: 3, nextAttemptAt: new Date(now - day).toISOString() },
    };
    const plan = prepare(entries, [], new Map(), jobs, new Set([priority.id]));
    expect(plan.ready.map(value => value.id)).toEqual([priority.id, fresh.id, due.id]);
    const worker = vi.fn(async (_entry: DshPlugin) => summary);
    expect(await runDailyDescriptions(entries, plan, { limit: 2, concurrency: 1, worker, now: () => now })).toEqual({ attempted: 2, completed: 2, failed: 0 });
    expect(worker.mock.calls.map(call => call[0].id)).toEqual([priority.id, fresh.id]);
    expect(plan.jobs[delayed.id]).toEqual(jobs[delayed.id]);
    expect(plan.jobs[due.id]).toEqual(jobs[due.id]);
  });

  it("persists the attempt before dispatch and result after completion", async () => {
    const entry = source(), plan = prepare([entry]);
    const states: string[] = [];
    await runDailyDescriptions([entry], plan, { limit: 1, concurrency: 1, now: () => now,
      onProgress: () => { states.push(plan.jobs[entry.id].status); },
      worker: async () => { expect(states).toEqual(["retry"]); return summary; } });
    expect(states).toEqual(["retry", "complete"]);
  });

  it("stops dispatch immediately if the attempt cannot be persisted", async () => {
    const entries = [source(1), source(2)], plan = prepare(entries);
    const worker = vi.fn(async () => summary);
    await expect(runDailyDescriptions(entries, plan, { limit: 2, concurrency: 2, worker,
      onProgress: () => { throw new Error("disk full"); } })).rejects.toThrow("disk full");
    expect(worker).not.toHaveBeenCalled();
    expect(plan.jobs[entries[1].id].attempts).toBe(0);
  });

  it("drains in-flight workers after completion persistence fails without dispatching another job", async () => {
    const entries = [source(1), source(2), source(3), source(4)], plan = prepare(entries);
    const first = deferred<ZhResult>(), second = deferred<ZhResult>(), secondStarted = deferred<void>();
    const worker = vi.fn((entry: DshPlugin) => {
      if (entry.id === entries[0].id) return first.promise;
      secondStarted.resolve(); return second.promise;
    });
    let persisted = 0, settled = false;
    const done = runDailyDescriptions(entries, plan, { limit: 4, concurrency: 2, worker, now: () => now,
      onProgress: () => { if (++persisted === 3) throw new Error("write failed"); } });
    const captured = done.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    await secondStarted.promise;
    expect(worker).toHaveBeenCalledTimes(2);
    first.resolve(summary);
    await first.promise; await Promise.resolve();
    expect(settled).toBe(false);
    expect(worker).toHaveBeenCalledTimes(2);
    second.resolve(summary);
    expect(await captured).toEqual(new Error("write failed"));
    expect(worker).toHaveBeenCalledTimes(2);
    expect(plan.jobs[entries[2].id].attempts).toBe(0);
    expect(plan.jobs[entries[3].id].attempts).toBe(0);
    expect(plan.jobs[entries[1].id].status).toBe("complete");
  });
});
