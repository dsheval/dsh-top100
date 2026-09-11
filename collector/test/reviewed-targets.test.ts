import { describe, expect, it, vi } from "vitest";
import reviews from "../config/reviewed-categories.json";
import descriptions from "../../plugin/src/shared/reviewed-descriptions.json";
import { reviewedPluginTargets, matchesReviewedTarget, quarantineUnreviewedTarget } from "../src/reviewed-targets.js";
import type { DshPlugin } from "@dsh-top100/schema";
import { planDailyCategories, runDailyCategories, type DailyCategoryInput } from "../src/daily-categories.js";
import { matchingEditorialHold } from "../src/content-source.js";
import { planDescriptionJobs } from "../src/description-jobs.js";
import { reviewedDescription } from "../src/editorial.js";

describe("September 11 source review", () => {
  const cohort = Object.entries(reviews).filter(([, value]) => "reviewBatch" in value && value.reviewBatch === "top100-20260911");
  const input = ([fullName, value]: (typeof cohort)[number]): DailyCategoryInput => ({
    fullName, name: fullName.split("/")[1], type: value.sourceType,
    description: value.sourceDescription, readmeSummary: value.sourceReadme,
    install: { method: "pnpm-profile", needsConfig: false,
      packageName: value.sourceInstall.packageName ?? undefined, repositoryPath: value.sourceInstall.repositoryPath ?? undefined,
      ...("functionEvidence" in value.sourceInstall ? { discovery: { status: "verified" as const, kind: "bundle" as const,
        checkedAt: "2026-09-11T00:00:00Z", policyVersion: 6, sourceRevision: "fixture",
        evidence: [`reviewed-function-sha256:${value.sourceInstall.functionEvidence}`] } } : {}) },
    stars: 100, topics: [], categories: [],
  });

  it("recovers thirty source-reviewed categories across the priority lists, and withholds the two excluded objects", async () => {
    expect(cohort).toHaveLength(32);
    const entries = cohort.map(input);
    const first = planDailyCategories(entries);
    const second = planDailyCategories(entries, { previous: first.state });
    expect(Object.values(second.state.jobs).filter(job => job.status === "complete")).toHaveLength(30);
    expect(second.state.jobs["zuorn/tydora"].status).toBe("review-required");
    expect(entries.find(entry => entry.fullName === "zuorn/tydora")!.categories).toEqual([]);
    expect(second.state.jobs["whitelonng/dshcode"].status).toBe("review-required");
    expect(second.ready).toHaveLength(0);
    const worker = vi.fn();
    await runDailyCategories(second, { model: "mock", worker });
    expect(worker).not.toHaveBeenCalled();
  });

  it("rejects caches for the six wrong package identities without invalidating other detection caches", () => {
    expect(Object.keys(reviewedPluginTargets)).toHaveLength(6);
    for (const target of Object.values(reviewedPluginTargets)) {
      const correct = { isPlugin: true, packageName: target.packageName, pluginPath: target.repositoryPath };
      expect(matchesReviewedTarget(correct, target)).toBe(true);
      expect(matchesReviewedTarget({ ...correct, packageName: "@deepseek-ai/dsh-root" }, target)).toBe(false);
      expect(matchesReviewedTarget({ ...correct, pluginPath: null }, target)).toBe(false);
      expect(matchesReviewedTarget({ ...correct, isPlugin: false }, target)).toBe(false);
      expect(matchesReviewedTarget(correct)).toBe(true);
    }
  });

  it("quarantines a wrong restored package and its commands without dropping metadata; same-target network failures retain content", () => {
    const target = reviewedPluginTargets["see-sol-lab/deepseekgui"];
    const previous = { ...input(cohort.find(([id]) => id === "see-sol-lab/deepseekgui")!),
      topics: ["dsh"], tags: ["dsh", "old generated tag"], lastCheckedAt: "2026-09-10T00:00:00Z",
      install: { method: "pnpm-profile", needsConfig: false, packageName: "@deepseek-ai/dsh-root",
        commands: ["old install command"], assessment: { status: "verified" } } } as DshPlugin;
    const quarantined = quarantineUnreviewedTarget(previous, target);
    expect(quarantined.stars).toBe(previous.stars);
    expect(quarantined.install).not.toHaveProperty("packageName");
    expect(quarantined.install).not.toHaveProperty("commands");
    expect(quarantined.install).not.toHaveProperty("assessment");
    expect(quarantined.install.discovery!.status).toBe("review-required");
    expect(quarantined.descriptionZh).toBe("中文简介待生成。");
    expect(quarantined.tags).toEqual(previous.topics);
    expect(quarantined.categories).toEqual([]);
    expect(matchingEditorialHold(quarantined)).not.toBeNull();
    expect(previous.install.packageName).toBe("@deepseek-ai/dsh-root");
    const current = { ...previous, install: { ...previous.install, packageName: target.packageName, repositoryPath: target.repositoryPath! } };
    expect(quarantineUnreviewedTarget(current, target)).toBe(current);
    expect(quarantineUnreviewedTarget(current, target, true).install).not.toHaveProperty("packageName");
  });

  it("keeps a withdrawn summary out of the description queue despite changed install commands or language navigation", () => {
    const entry = input(cohort.find(([id]) => id === "zuorn/tydora")!);
    entry.readmeSummary = `中文 | English ${entry.readmeSummary}`;
    entry.install!.commands = ["updated installation command"];
    expect(matchingEditorialHold(entry)).not.toBeNull();
    const descriptionZh = reviewedDescription({ ...entry, description: entry.description ?? "", readmeSummary: entry.readmeSummary ?? "", install: entry.install ?? undefined });
    expect(descriptionZh).toBe("中文简介待生成。");
    const plan = planDescriptionJobs([{ ...entry, id: entry.fullName, description: entry.description ?? "", readmeSummary: entry.readmeSummary ?? null, descriptionZh }], {}, new Set(), Date.now());
    expect(plan.ready).toHaveLength(0);
    expect(plan.jobs[entry.fullName].status).toBe("review-required");
    expect(descriptions["zuorn/tydora"].suspended).toBe(true);
  });
});
