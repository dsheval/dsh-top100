import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichmentProgress, enrichedSnapshot, planCatalogEnrichment, runCatalogEnrichment, type EnrichmentState } from "../src/catalog-enrichment.js";
import { enrichCatalogCli, loadEnrichmentState } from "../src/enrich-catalog.js";
import { bindCategoryAssignments } from "../src/categories.js";
import * as editorial from "../src/editorial.js";
import editorialHolds from "../config/editorial-holds.json";
import type { RankingEntry, RankingsDocument } from "../src/rankings.js";

const now = Date.parse("2026-09-10T00:00:00Z");
const day = 86_400_000;
const summary = { descriptionZh: "搜索学术论文并整理可核对的引用来源。", tagsZh: ["学术研究"] };
const suggestions = [{ id: "knowledge" as const, confidence: 0.95, evidence: "检索论文与引用来源" }];
const temporary: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function entry(index = 1): RankingEntry {
  return { rank: index, totalRank: index, fullName: `sample/research-${index}`, name: `research-${index}`, owner: "sample",
    description: "Search academic papers and retrieve their citations.", descriptionZh: "中文简介待生成。", readmeSummary: "Find papers with references.",
    stars: 1000 - index, dailyStars: index, weeklyStars: index * 7, hotScore: 99 - index,
    forks: 1, openIssues: 0, language: "TypeScript", homepage: null, license: null, topics: [], tags: [], categories: [],
    type: "cordis-plugin", install: { method: "pnpm-profile", needsConfig: false }, sources: [], url: `https://github.com/sample/research-${index}`,
    pushedAt: "2026-09-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
}
function document(entries = [entry()]): RankingsDocument {
  return { schemaVersion: 2, generatedAt: "2026-09-09T00:00:00Z", snapshotDate: "2026-09-09", categories: [],
    definitions: { total: "total", rising: "rising", hot: "hot" },
    rankings: { total: entries, hot: entries.slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1, dailyStars: 123 })), rising: entries.slice(0, 100).map(entry => ({ ...entry })) },
    directories: { skills: [] } };
}
function workers() { return { translate: vi.fn(async () => summary), classify: vi.fn(async () => suggestions) }; }

describe("frozen catalog enrichment jobs", () => {
  it("invalidates carried model categories after an entry type change", async () => {
    const first = planCatalogEnrichment(document(), undefined, now);
    await runCatalogEnrichment(first, { limit: 2, concurrency: 1, model: "fixture", workers: workers(), now: () => now });
    const copied = structuredClone(first.document);
    copied.rankings.total[0].type = "skill";
    const next = planCatalogEnrichment(copied, first.state, now);
    expect(next.state.jobs[entry().fullName].categories.status).toBe("pending");
    expect(next.document.rankings.total[0].categories.some(c => c.source === "deepseek")).toBe(false);
  });

  function heldEntry(fullName: keyof typeof editorialHolds = "zju-real/polaris"): RankingEntry {
    const hold = editorialHolds[fullName];
    return { ...entry(), fullName, name: fullName.split("/")[1], description: hold.sourceDescription,
      readmeSummary: hold.sourceReadme, install: structuredClone(hold.sourceInstall) };
  }
  it("holds all configured ambiguous source identities without invoking either model worker", async () => {
    expect(Object.keys(editorialHolds).length).toBeGreaterThan(0);
    for (const fullName of Object.keys(editorialHolds) as Array<keyof typeof editorialHolds>) {
      const plan = planCatalogEnrichment(document([heldEntry(fullName)]), undefined, now);
      const jobs = plan.state.jobs[fullName];
      for (const job of Object.values(jobs)) {
        expect(["complete", "review-required"], fullName).toContain(job.status);
        if (job.status === "review-required") expect(job.reviewReason).toBe(editorialHolds[fullName].reason);
      }
      expect(enrichmentProgress(plan, now)).toMatchObject({
        description: { "review-required": Number(jobs.description.status === "review-required"), ready: 0 },
        categories: { "review-required": Number(jobs.categories.status === "review-required"), ready: 0 },
      });
      const calls = workers();
      expect(await runCatalogEnrichment(plan, { limit: 100, concurrency: 2, model: "test", workers: calls })).toMatchObject({ attempted: 0 });
      expect(calls.translate).not.toHaveBeenCalled();
      expect(calls.classify).not.toHaveBeenCalled();
    }
  });
  it("preserves completed Chinese and authoritative categories while holding only unfinished fields", () => {
    const held = { ...heldEntry(), descriptionZh: summary.descriptionZh };
    const plan = planCatalogEnrichment(document([held]), undefined, now);
    expect(plan.document.rankings.total[0].descriptionZh).toBe(summary.descriptionZh);
    expect(plan.state.jobs[held.fullName].description.status).toBe("complete");
    expect(plan.state.jobs[held.fullName].categories.status).toBe("review-required");
    held.categories = bindCategoryAssignments(held, [{ ...suggestions[0], source: "manual" }]);
    const complete = planCatalogEnrichment(document([held]), undefined, now);
    expect(complete.state.jobs[held.fullName].categories.status).toBe("complete");
    expect(complete.document.rankings.total[0].categories).toEqual(held.categories);
  });
  it("prefers a matching editorial description over existing Chinese on a held entry", () => {
    const held = { ...heldEntry(), descriptionZh: "这是尚未修正的旧中文介绍，仍然描述原来错误的用途。" };
    vi.spyOn(editorial, "reviewedDescription").mockImplementation(input =>
      input.description === held.description && input.readmeSummary === held.readmeSummary ? summary.descriptionZh : null);
    const plan = planCatalogEnrichment(document([held]), undefined, now);
    expect(plan.document.rankings.total[0].descriptionZh).toBe(summary.descriptionZh);
    expect(plan.state.jobs[held.fullName].description).toMatchObject({ status: "complete", descriptionZh: summary.descriptionZh });
    expect(plan.ready).toHaveLength(0);
  });
  it.each([
    ["中文简介待生成。", "review-required"],
    ["这是已有的中文介绍，应在人工复核期间继续保留。", "complete"],
  ] as const)("blocks completed model cache replay for a held entry with %s", (descriptionZh, descriptionStatus) => {
    const held = { ...heldEntry(), descriptionZh };
    const previous = planCatalogEnrichment(document([held]), undefined, now).state;
    const jobs = previous.jobs[held.fullName];
    // The source hash and policy deliberately match: only the newly applied
    // editorial hold may prevent replay of these earlier completed results.
    jobs.description = { ...jobs.description, status: "complete", descriptionZh: summary.descriptionZh, tagsZh: ["旧缓存标签"] };
    jobs.categories = { ...jobs.categories, status: "complete",
      categories: bindCategoryAssignments(held, [{ ...suggestions[0], source: "deepseek" }]) };

    const replanned = planCatalogEnrichment(document([held]), previous, now);
    const current = replanned.state.jobs[held.fullName];
    for (const kind of ["description", "categories"] as const) {
      expect(current[kind].sourceHash).toBe(jobs[kind].sourceHash);
      expect(current[kind].policyVersion).toBe(jobs[kind].policyVersion);
    }
    expect(current.description.status).toBe(descriptionStatus);
    expect(current.categories.status).toBe("review-required");
    expect(replanned.document.rankings.total[0].descriptionZh).toBe(descriptionZh);
    expect(replanned.document.rankings.total[0].tags).toEqual(held.tags);
    expect(replanned.document.rankings.total[0].categories).toEqual([]);
    expect(replanned.ready).toHaveLength(0);
  });

  it("releases source-bound holds when evidence changes and no separate scope ambiguity remains", () => {
    const held = heldEntry();
    const previous = planCatalogEnrichment(document([held]), undefined, now).state;
    for (const changed of [
      { ...held, description: "A new project description with resolved scope.", readmeSummary: "polaris-plugin-hello retrieves academic papers." },
      { ...held, readmeSummary: "polaris-plugin-hello retrieves academic papers with citations." },
      { ...held, install: { ...held.install, packageName: "polaris-real-plugin", repositoryPath: undefined } },
    ]) {
      const plan = planCatalogEnrichment(document([changed]), previous, now);
      expect(plan.state.jobs[held.fullName].description.status).toBe("pending");
      expect(plan.state.jobs[held.fullName].categories.status).toBe("pending");
      expect(plan.ready).toHaveLength(2);
    }
  });
  it("holds root runtime and unidentifiable subpackage sources before spending model requests", () => {
    for (const install of [
      { ...entry().install, packageName: "@deepseek-ai/dsh-root" },
      { ...entry().install, packageName: "@sample/attachments-do", repositoryPath: "packages/attachments-do" },
      { ...entry().install, packageName: "core", repositoryPath: "packages/core" },
    ]) {
      const plan = planCatalogEnrichment(document([{ ...entry(), install }]), undefined, now);
      expect(plan.ready).toHaveLength(0);
      expect(plan.state.jobs[entry().fullName].description.status).toBe("review-required");
      expect(plan.state.jobs[entry().fullName].categories.status).toBe("review-required");
    }
    const selected = { ...entry(), install: { ...entry().install, packageName: "@sample/research-tool", repositoryPath: "packages/research-tool" },
      readmeSummary: "research-tool retrieves academic papers with verifiable citations." };
    expect(planCatalogEnrichment(document([selected]), undefined, now).ready).toHaveLength(2);
  });
  it("continues ordinary catalog jobs while held identities remain outside the batch", async () => {
    const held = heldEntry();
    const normal = entry(2);
    const plan = planCatalogEnrichment(document([held, normal]), undefined, now);
    const calls = workers();
    expect(await runCatalogEnrichment(plan, { limit: 100, concurrency: 2, model: "test", workers: calls })).toMatchObject({ attempted: 2, completed: 2 });
    expect(calls.translate.mock.calls).toHaveLength(1);
    expect(calls.classify.mock.calls).toHaveLength(1);
    expect(plan.state.jobs[held.fullName].description.status).toBe("review-required");
  });
  it("separates missing evidence from pending model work and does not count placeholders as Chinese", () => {
    const source = document([{ ...entry(), description: "", readmeSummary: "", descriptionZh: "资料不足" }]);
    const plan = planCatalogEnrichment(source, undefined, now);
    expect(enrichmentProgress(plan, now)).toMatchObject({ description: { complete: 0, "missing-source": 1 }, categories: { "missing-source": 1 } });
    expect(plan.ready).toHaveLength(0);
    expect(plan.document.rankings.total[0].descriptionZh).toBe("中文简介待生成。");
  });

  it("preserves valid Chinese and source-bound authoritative categories without paid work", () => {
    const value = { ...entry(), descriptionZh: summary.descriptionZh };
    value.categories = bindCategoryAssignments(value, [{ ...suggestions[0], source: "manual" }]);
    const plan = planCatalogEnrichment(document([value]), undefined, now);
    expect(plan.ready).toHaveLength(0);
    expect(enrichmentProgress(plan, now)).toMatchObject({ description: { complete: 1 }, categories: { complete: 1 } });
  });

  it("persists each success, resumes without duplicate requests, and preserves frozen metrics and evidence", async () => {
    const input = document();
    const before = structuredClone(input);
    const plan = planCatalogEnrichment(input, undefined, now);
    const checkpoints: EnrichmentState[] = [];
    const calls = workers();
    expect(await runCatalogEnrichment(plan, { limit: 2, concurrency: 1, model: "test", workers: calls, now: () => now,
      onProgress: () => checkpoints.push(structuredClone(plan.state)) })).toEqual({ attempted: 2, completed: 2, failed: 0 });
    expect(checkpoints).toHaveLength(4);
    expect(Object.values(checkpoints[1].jobs)[0].categories.status).toBe("complete");
    const resumed = planCatalogEnrichment(input, plan.state, now + 1);
    expect(resumed.ready).toHaveLength(0);
    const output = enrichedSnapshot(resumed);
    expect(output.rankings.total[0].descriptionZh).toBe(summary.descriptionZh);
    expect(output.rankings.hot[0].descriptionZh).toBe(summary.descriptionZh);
    expect(output.rankings.hot[0].dailyStars).toBe(123);
    expect(output.rankings.total[0].dailyStars).toBe(1);
    expect(output.generatedAt).toBe(input.generatedAt);
    expect(output.rankings.total[0].description).toBe(input.rankings.total[0].description);
    expect(output.rankings.total[0].readmeSummary).toBe(input.rankings.total[0].readmeSummary);
    expect(input).toEqual(before);
  });

  it("invalidates cached results and retry backoff when source evidence or policy changes", async () => {
    const input = document();
    const first = planCatalogEnrichment(input, undefined, now);
    await runCatalogEnrichment(first, { limit: 2, concurrency: 1, model: "test", workers: workers(), now: () => now });
    const changed = structuredClone(input);
    changed.rankings.total[0].readmeSummary = "The project now synchronizes files across devices.";
    expect(planCatalogEnrichment(changed, first.state, now).ready).toHaveLength(2);
    const outdated = structuredClone(first.state);
    outdated.jobs[entry().fullName].description.policyVersion = 0;
    const replanned = planCatalogEnrichment(input, outdated, now);
    expect(replanned.ready.map(task => task.kind)).toEqual(["description"]);
    expect(replanned.ready[0].job.attempts).toBe(0);
  });

  it.each([
    ["packageName", "@sample/replacement"],
    ["repositoryPath", "packages/replacement"],
  ] as const)("invalidates completed description and category jobs when selected %s changes", async (field, value) => {
    const input = document([{ ...entry(), readmeSummary: "@sample/original and @sample/replacement retrieve academic references.", install: {
      ...entry().install, packageName: "@sample/original", repositoryPath: "packages/original",
    } }]);
    const first = planCatalogEnrichment(input, undefined, now);
    await runCatalogEnrichment(first, { limit: 2, concurrency: 1, model: "test", workers: workers(), now: () => now });
    expect(planCatalogEnrichment(input, first.state, now).ready).toHaveLength(0);

    const changed = structuredClone(input);
    changed.rankings.total[0].install[field] = value;
    const replanned = planCatalogEnrichment(changed, first.state, now);
    expect(replanned.ready.map(task => task.kind).sort()).toEqual(["categories", "description"]);
    for (const kind of ["description", "categories"] as const) {
      const job = replanned.state.jobs[entry().fullName][kind];
      expect(job).toMatchObject({ status: "pending", attempts: 0 });
      expect(job.sourceHash).not.toBe(first.state.jobs[entry().fullName][kind].sourceHash);
    }
    expect(replanned.document.rankings.total[0].descriptionZh).not.toBe(summary.descriptionZh);
  });

  it.each(["description", "readmeSummary", "packageName", "repositoryPath"] as const)("invalidates known cached Chinese copied into the input when %s changes", async field => {
    const input = document([{ ...entry(), readmeSummary: "@sample/original and @sample/replacement retrieve academic references.", install: {
      ...entry().install, packageName: "@sample/original", repositoryPath: "packages/original",
    } }]);
    const first = planCatalogEnrichment(input, undefined, now);
    await runCatalogEnrichment(first, { kind: "description", limit: 1, concurrency: 1, model: "test", workers: workers(), now: () => now });
    const changed = enrichedSnapshot(first);
    const selected = changed.rankings.total[0];
    if (field === "packageName") selected.install.packageName = "@sample/replacement";
    else if (field === "repositoryPath") selected.install.repositoryPath = "packages/replacement";
    else selected[field] = "@sample/original now synchronizes files instead of retrieving papers.";
    const replanned = planCatalogEnrichment(changed, first.state, now);
    expect(replanned.state.jobs[selected.fullName].description).toMatchObject({ status: "pending", attempts: 0 });
    expect(replanned.document.rankings.total[0].descriptionZh).toBe("中文简介待生成。");
    expect(replanned.ready.some(task => task.kind === "description")).toBe(true);
  });

  it("preserves independent new Chinese and current editorial text when the known description source changes", async () => {
    const first = planCatalogEnrichment(document(), undefined, now);
    await runCatalogEnrichment(first, { kind: "description", limit: 1, concurrency: 1, model: "test", workers: workers(), now: () => now });
    const changed = enrichedSnapshot(first);
    const selected = changed.rankings.total[0];
    selected.readmeSummary = "Synchronize files across devices and restore selected backups.";
    const freshChinese = "跨设备同步文件并恢复选定的备份，方便维护一致的本地资料。";
    selected.descriptionZh = freshChinese;
    const independent = planCatalogEnrichment(changed, first.state, now);
    expect(independent.state.jobs[selected.fullName].description).toMatchObject({ status: "complete", descriptionZh: freshChinese });

    selected.descriptionZh = summary.descriptionZh;
    vi.spyOn(editorial, "reviewedDescription").mockImplementation(input =>
      input.readmeSummary === selected.readmeSummary ? freshChinese : null);
    const reviewed = planCatalogEnrichment(changed, first.state, now);
    expect(reviewed.state.jobs[selected.fullName].description).toMatchObject({ status: "complete", descriptionZh: freshChinese });
  });

  it("does not discard input Chinese solely because a different policy hashed the source", async () => {
    const first = planCatalogEnrichment(document(), undefined, now);
    await runCatalogEnrichment(first, { kind: "description", limit: 1, concurrency: 1, model: "test", workers: workers(), now: () => now });
    const input = enrichedSnapshot(first);
    const previous = structuredClone(first.state);
    previous.jobs[entry().fullName].description.policyVersion--;
    previous.jobs[entry().fullName].description.sourceHash = "hash-from-a-different-policy";
    const plan = planCatalogEnrichment(input, previous, now);
    expect(plan.state.jobs[entry().fullName].description).toMatchObject({ status: "complete", descriptionZh: summary.descriptionZh });
  });

  it("backs off empty classifications instead of repeatedly consuming the first slots", async () => {
    const input = document([1, 2].map(index => ({ ...entry(index), descriptionZh: summary.descriptionZh })));
    const first = planCatalogEnrichment(input, undefined, now);
    await runCatalogEnrichment(first, { limit: 1, concurrency: 1, model: "test", workers: { ...workers(), classify: async () => [] }, now: () => now });
    expect(first.state.jobs[entry().fullName].categories).toMatchObject({ status: "retry", attempts: 1, failure: "empty-or-invalid-result", nextAttemptAt: new Date(now + day).toISOString() });
    const next = planCatalogEnrichment(input, first.state, now + 1);
    expect(next.ready.map(task => task.fullName)).toEqual([entry(2).fullName]);
    const due = planCatalogEnrichment(input, first.state, now + day);
    expect(due.ready[0].fullName).toBe(entry(2).fullName);
    expect(due.ready).toHaveLength(2);
  });

  it("records interrupted attempts before dispatch and never caches raw provider errors", async () => {
    const plan = planCatalogEnrichment(document(), undefined, now);
    const checkpoints: EnrichmentState[] = [];
    await runCatalogEnrichment(plan, { limit: 1, concurrency: 1, model: "test", workers: { ...workers(), classify: async () => { throw new Error("fake-secret-error-body"); } }, now: () => now,
      onProgress: () => checkpoints.push(structuredClone(plan.state)) });
    expect(checkpoints[0].jobs[entry().fullName].categories).toMatchObject({ attempts: 1, status: "retry" });
    expect(JSON.stringify(plan.state)).not.toContain("fake-secret");
    expect(plan.state.jobs[entry().fullName].categories.failure).toBe("request-failed");
  });

  it("does not dispatch model requests when the start checkpoint fails", async () => {
    const plan = planCatalogEnrichment(document([entry(1), entry(2)]), undefined, now);
    const calls = workers();
    const failure = new Error("local checkpoint write failed");
    await expect(runCatalogEnrichment(plan, { kind: "description", limit: 2, concurrency: 2, model: "test", workers: calls,
      onProgress: () => { throw failure; } })).rejects.toBe(failure);
    expect(calls.translate).not.toHaveBeenCalled();
    expect(plan.state.jobs[entry(2).fullName].description).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("stops new dispatches after a persistence failure and drains in-flight workers before rejecting", async () => {
    const plan = planCatalogEnrichment(document([entry(1), entry(2), entry(3)]), undefined, now);
    const failure = new Error("completion checkpoint write failed");
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
    const calls = { ...workers(), translate: vi.fn(async (value: RankingEntry) => {
      if (value.fullName === entry(2).fullName) await secondGate;
      return summary;
    }) };
    const saved: string[] = [];
    let settled = false;
    const result = runCatalogEnrichment(plan, { kind: "description", limit: 3, concurrency: 2, model: "test", workers: calls,
      onProgress: task => {
        if (task.job.status !== "complete") return;
        if (task.fullName === entry(1).fullName) throw failure;
        saved.push(task.fullName);
      } });
    // Observe rejection immediately, but do not let the test itself leave an
    // unhandled promise if draining regresses to early Promise.all rejection.
    const outcome = result.then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
    try {
      await new Promise(resolve => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(calls.translate).toHaveBeenCalledTimes(2);
      expect(plan.state.jobs[entry(3).fullName].description).toMatchObject({ status: "pending", attempts: 0 });
    } finally { releaseSecond(); }
    expect(await outcome).toEqual({ error: failure });
    expect(saved).toEqual([entry(2).fullName]);
    expect(plan.state.jobs[entry(2).fullName].description.status).toBe("complete");
    expect(calls.translate).toHaveBeenCalledTimes(2);
  });

  it("limits requests, bounds concurrency, and prioritizes visible entries before higher-star long-tail Skills", async () => {
    const input = document([entry(1), entry(2)]);
    input.directories.skills = [{ ...entry(3), rank: 1, type: "skill", stars: 50_000 }];
    const plan = planCatalogEnrichment(input, undefined, now);
    expect(plan.ready[0].fullName).toBe(entry(1).fullName);
    expect(plan.ready.at(-1)?.fullName).toBe(entry(3).fullName);
    let active = 0;
    let peak = 0;
    const pause = async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--; };
    const calls = { translate: vi.fn(async () => { await pause(); return summary; }), classify: vi.fn(async () => { await pause(); return suggestions; }) };
    const result = await runCatalogEnrichment(plan, { limit: 3, concurrency: 2, model: "test", workers: calls });
    expect(result.attempted).toBe(3);
    expect(calls.translate.mock.calls.length + calls.classify.mock.calls.length).toBe(3);
    expect(peak).toBe(2);
  });
  it.each(["description", "categories"] as const)("filters %s jobs before the limit without reordering or changing other job statistics", async (kind) => {
    const plan = planCatalogEnrichment(document([entry(1), entry(2)]), undefined, now);
    const originalOrder = plan.ready.map(task => `${task.fullName}:${task.kind}`);
    const calls = workers();
    const result = await runCatalogEnrichment(plan, { kind, limit: 1, concurrency: 1, model: "test", workers: calls, now: () => now });
    expect(result).toEqual({ attempted: 1, completed: 1, failed: 0 });
    expect(plan.ready.map(task => `${task.fullName}:${task.kind}`)).toEqual(originalOrder);
    const selected = kind === "description" ? calls.translate : calls.classify;
    const other = kind === "description" ? calls.classify : calls.translate;
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected.mock.calls[0]?.[0]).toMatchObject({ fullName: entry(1).fullName });
    expect(other).not.toHaveBeenCalled();
    const otherKind = kind === "description" ? "categories" : "description";
    expect(enrichmentProgress(plan, now)[kind]).toMatchObject({ complete: 1, pending: 1, ready: 1 });
    expect(enrichmentProgress(plan, now)[otherKind]).toMatchObject({ complete: 0, pending: 2, ready: 2 });
    for (const value of Object.values(plan.state.jobs)) expect(value[otherKind]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("keeps compatibility category counts inclusive of the separate Skills directory", () => {
    const input = document();
    input.directories.skills = [{ ...entry(2), rank: 1, type: "skill" }];
    for (const value of [...input.rankings.total, ...input.directories.skills]) {
      value.categories = bindCategoryAssignments(value, [{ ...suggestions[0], source: "manual" }]);
    }
    expect(enrichedSnapshot(planCatalogEnrichment(input, undefined, now)).categories.find(value => value.id === "knowledge")?.count).toBe(2);
  });
});

describe("local enrichment CLI", () => {
  function paths() {
    const root = mkdtempSync(join(tmpdir(), "enrich-catalog-")); temporary.push(root);
    const input = join(root, "frozen.json");
    writeFileSync(input, JSON.stringify(document()));
    return { root, input, output: join(root, "output") };
  }
  it("dry-runs without credentials, network requests, or output writes", async () => {
    const { input, output } = paths();
    const original = readFileSync(input, "utf8");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await enrichCatalogCli([input, output, "--dry-run", "--limit", "1"]);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ dryRun: true, entries: 1, scheduledJobs: 1 });
    expect(existsSync(output)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readFileSync(input, "utf8")).toBe(original);
  });
  it.each([
    ["all", 2], ["description", 1], ["categories", 1],
  ] as const)("reports scheduled %s jobs while retaining complete dry-run statistics", async (kind, scheduledJobs) => {
    const { input, output } = paths();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await enrichCatalogCli([input, output, "--dry-run", "--kind", kind, "--limit", "10"]);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      kind, scheduledJobs, description: { ready: 1 }, categories: { ready: 1 },
    });
    expect(existsSync(output)).toBe(false);
  });
  it("rejects an invalid job kind before creating output", async () => {
    const { input, output } = paths();
    await expect(enrichCatalogCli([input, output, "--dry-run", "--kind", "translation"])).rejects.toThrow("kind must be all, description or categories");
    expect(existsSync(output)).toBe(false);
  });
  it("requires no credentials when the selected kind has no pending jobs and records the kind", async () => {
    const { input, output } = paths();
    writeFileSync(input, JSON.stringify(document([{ ...entry(), descriptionZh: summary.descriptionZh }])));
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await enrichCatalogCli([input, output, "--kind", "description"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ kind: "description", attempted: 0, categories: { pending: 1 } });
    expect(JSON.parse(readFileSync(join(output, "enrichment-progress.json"), "utf8"))).toMatchObject({ kind: "description", categories: { pending: 1 } });
  });

  it("rejects missing credentials before writing and never permits the input inside output", async () => {
    const { root, input, output } = paths();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    await expect(enrichCatalogCli([input, output], { requestMode: "offline-test", offlineTransport: vi.fn() })).rejects.toThrow("DEEPSEEK_API_KEY");
    expect(existsSync(output)).toBe(false);
    await expect(enrichCatalogCli([input, root, "--dry-run"])).rejects.toThrow("outside");
  });
  it("refuses paused jobs before creating state even with a residual key and enabled switch", async () => {
    const { input, output } = paths();
    vi.stubEnv("DEEPSEEK_API_KEY", "residual-test-key");
    vi.stubEnv("DSH_MODEL_REQUESTS_ENABLED", "1");
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    await expect(enrichCatalogCli([input, output])).rejects.toThrow("Model requests are paused");
    expect(existsSync(output)).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });
  it("can materialize a local repaired snapshot with zero paid requests", async () => {
    const { input, output } = paths();
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    await enrichCatalogCli([input, output, "--limit", "0"]);
    expect(existsSync(join(output, "snapshot", "rankings.json"))).toBe(true);
    expect(existsSync(join(output, "enrichment-state.json"))).toBe(true);
    expect(existsSync(join(output, "enrichment-progress.json"))).toBe(true);
    expect(existsSync(join(output, ".enrichment.lock"))).toBe(false);
  });
  it("uses project API configuration and persists the start before dispatch and completion before checkpoint cleanup", async () => {
    const { input, output } = paths();
    vi.stubEnv("DEEPSEEK_API_KEY", "test-secret-not-for-logs");
    vi.stubEnv("DEEPSEEK_API_BASE", "https://configured.example.test/v1");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const event = JSON.parse(readFileSync(join(output, "enrichment-journal.jsonl"), "utf8").trim());
      expect(event.job).toMatchObject({ status: "retry", attempts: 1 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ categories: suggestions }) } }] }));
    });
    await enrichCatalogCli([input, output, "--limit", "1", "--concurrency", "1"], { requestMode: "offline-test", offlineTransport: fetchMock });
    expect(fetchMock.mock.calls[0][0]).toBe("https://configured.example.test/v1/chat/completions");
    const state = JSON.parse(readFileSync(join(output, "enrichment-state.json"), "utf8"));
    expect(state.jobs[entry().fullName].categories.status).toBe("complete");
    expect(readFileSync(join(output, "enrichment-journal.jsonl"), "utf8")).toBe("");
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-secret");
  });
  it("dispatches only the requested description kind through the CLI and leaves classification resumable", async () => {
    const { input, output } = paths();
    vi.stubEnv("DEEPSEEK_API_KEY", "test-secret-not-for-logs");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(summary) } }],
    })));
    await enrichCatalogCli([input, output, "--kind", "description", "--limit", "1"], { requestMode: "offline-test", offlineTransport: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = JSON.parse(readFileSync(join(output, "enrichment-state.json"), "utf8"));
    expect(state.jobs[entry().fullName].description.status).toBe("complete");
    expect(state.jobs[entry().fullName].categories).toMatchObject({ status: "pending", attempts: 0 });
    expect(JSON.parse(readFileSync(join(output, "enrichment-progress.json"), "utf8")).kind).toBe("description");
  });

  it("replays completed journal events, ignores only a truncated last line, and rejects older source/policy events", () => {
    const { root } = paths();
    const source = document();
    const statePath = join(root, "state.json");
    const journalPath = join(root, "journal.jsonl");
    const state = planCatalogEnrichment(source, undefined, now).state;
    writeFileSync(statePath, JSON.stringify(state));
    const job = { ...state.jobs[entry().fullName].description, status: "complete", descriptionZh: summary.descriptionZh };
    const event = { fullName: entry().fullName, kind: "description", job };
    writeFileSync(journalPath, JSON.stringify(event) + '\n{"truncated":');
    const recovered = loadEnrichmentState(statePath, journalPath, source)!;
    expect(planCatalogEnrichment(source, recovered, now).document.rankings.total[0].descriptionZh).toBe(summary.descriptionZh);
    const changed = document([{ ...entry(), description: "A different repository purpose." }]);
    expect(loadEnrichmentState(statePath, journalPath, changed)!.jobs[entry().fullName].description.status).toBe("pending");
    writeFileSync(journalPath, JSON.stringify({ ...event, job: { ...job, policyVersion: 0 } }) + "\n");
    expect(loadEnrichmentState(statePath, journalPath, source)!.jobs[entry().fullName].description.status).toBe("pending");
    writeFileSync(journalPath, '{"broken":\n' + JSON.stringify(event) + "\n");
    expect(() => loadEnrichmentState(statePath, journalPath, source)).toThrow();
  });
});

it("preserves a newer supplied Chinese edit even when an old model cache has the same source hash", async () => {
  const input = document();
  const first = planCatalogEnrichment(input, undefined, now);
  await runCatalogEnrichment(first, { kind: "description", limit: 1, concurrency: 1, model: "test", workers: workers(), now: () => now });
  input.rankings.total[0].descriptionZh = "人工重新核对论文检索范围，修订这条项目介绍。";
  expect(planCatalogEnrichment(input, first.state, now).document.rankings.total[0].descriptionZh).toBe(input.rankings.total[0].descriptionZh);
});
