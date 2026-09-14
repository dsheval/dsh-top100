import { describe, expect, it } from "vitest";
import { bindDailySourceJob, type DailyScopeJob } from "../src/daily-model-scope.js";
import { contentSourceHash } from "../src/content-source.js";
import { prepareDailyDescriptions } from "../src/daily-descriptions.js";
import { planDailyCategories } from "../src/daily-categories.js";
import type { DshPlugin } from "@dsh-top100/schema";

function source(description = "Search academic papers."): DshPlugin {
  return { id: "acme/papers", fullName: "acme/papers", name: "papers", type: "cordis-plugin", description,
    readmeSummary: "Search papers and retrieve document metadata.", descriptionZh: null, stars: 1, topics: [], tags: [], categories: [],
    install: { method: "pnpm-profile", packageName: "dsh-papers" } } as unknown as DshPlugin;
}
const previous = () => new Map([["acme/papers", source()]]);

describe("authorized daily source changes", () => {
  it("does not activate existing backlog after the paid switch or cache reset", () => {
    const entry = source(), old = previous();
    const descriptions = prepareDailyDescriptions([structuredClone(entry)], old, new Map(), {}, new Set(), Date.now());
    const categories = planDailyCategories([structuredClone(entry)]);
    expect(descriptions.ready).toHaveLength(1);
    expect(categories.ready).toHaveLength(1);
    expect(descriptions.ready.filter(p => bindDailySourceJob(p, old, undefined, descriptions.jobs[p.id]))).toHaveLength(0);
    expect(categories.ready.filter(t => bindDailySourceJob(t.entry, old, undefined, t.job))).toHaveLength(0);
  });
  it("allows new or changed sources and carries deferred eligibility", () => {
    for (const entry of [source("Search patents and citations."), { ...source(), id: "acme/new", fullName: "acme/new" }]) {
      const job: DailyScopeJob = {};
      expect(bindDailySourceJob(entry, previous(), undefined, job)).toBe(true);
      expect(job.dailySourceHash).toBe(contentSourceHash(entry, "description"));
      const nextBaseline = new Map([[entry.fullName.toLowerCase(), entry]]);
      expect(bindDailySourceJob(entry, nextBaseline, job, { attempts: 0 })).toBe(true);
      expect(bindDailySourceJob(entry, nextBaseline, job, { attempts: 1 })).toBe(true);
      expect(bindDailySourceJob(entry, nextBaseline, job, { attempts: 2 })).toBe(false);
    }
  });
  it("ignores rankings, names and discovery topics", () => {
    const entry = { ...source(), stars: 100, name: "new display name", topics: ["popular"] };
    expect(bindDailySourceJob(entry, previous(), undefined, {})).toBe(false);
  });
  it("does not automatically pay for a changed package identity", () => {
    for (const entry of [{ ...source(), type: "skill" }, { ...source(), install: { ...source().install, packageName: "different-package" } },
      { ...source(), install: { ...source().install, repositoryPath: "packages/new" } }]) {
      expect(bindDailySourceJob(entry, previous(), undefined, {})).toBe(false);
    }
  });
  it("fails closed without a full previous catalog or with a stale eligibility marker", () => {
    const entry = source();
    expect(bindDailySourceJob(entry, new Map(), undefined, {})).toBe(false);
    expect(bindDailySourceJob(entry, previous(), { dailySourceHash: "stale" }, {})).toBe(false);
  });
  it("leaves evidence-poor and already complete descriptions out of the planned queue", () => {
    for (const entry of [source("无资料"), { ...source(), descriptionZh: "检索学术论文并返回文献信息，帮助查找研究资料。" }]) {
      if (!entry.descriptionZh) entry.readmeSummary = null;
      const plan = prepareDailyDescriptions([entry], previous(), new Map(), {}, new Set(), Date.now());
      expect(plan.ready.filter(p => bindDailySourceJob(p, previous(), undefined, plan.jobs[p.id]))).toHaveLength(0);
    }
  });
});
