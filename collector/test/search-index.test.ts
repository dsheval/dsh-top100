import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  resolveSearchInstallTarget,
  toSnapshotSearchEntry,
} from "../src/search-index.js";
import type { RankingsDocument } from "../src/rankings.js";

describe("compact search index", () => {
  it("keeps search and install fields while omitting full-catalog-only fields", () => {
    const entry = {
      rank: 1,
      totalRank: 1,
      fullName: "acme/demo",
      name: "demo",
      owner: "acme",
      description: "English description",
      descriptionZh: "中文简介",
      stars: 12,
      dailyStars: 1,
      weeklyStars: 3,
      hotScore: 8,
      forks: 4,
      openIssues: 2,
      language: "TypeScript",
      homepage: null,
      license: "MIT",
      topics: ["dsh"],
      tags: ["tools"],
      categories: [{ id: "tools", confidence: 0.9, evidence: "tool", source: "manual" as const }],
      type: "cordis-plugin",
      install: { method: "pnpm-profile", commands: ["dsh plugin add demo"] },
      sources: ["github"],
      url: "https://github.com/acme/demo",
      pushedAt: "2026-08-31T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
    };
    const document: RankingsDocument = {
      schemaVersion: 2,
      generatedAt: "2026-08-31T00:00:00Z",
      snapshotDate: "2026-08-31",
      definitions: { total: "total", rising: "rising", hot: "hot" },
      categories: [],
      rankings: { total: [entry], rising: [], hot: [] },
    };
    const compact = buildSearchIndex(document);
    expect(compact.rankings[0]).toMatchObject({
      fullName: "acme/demo",
      name: "demo",
      description: "English description",
      descriptionZh: "中文简介",
      license: "MIT",
      pushedAt: "2026-08-31T00:00:00Z",
      install: entry.install,
      categories: ["tools"],
    });
    expect(compact.rankings[0]).not.toHaveProperty("forks");
    expect(compact.rankings[0]).not.toHaveProperty("owner");
    expect(compact.rankings[0]).not.toHaveProperty("hotScore");

    const snapshot = toSnapshotSearchEntry(document.rankings.total[0]);
    expect(snapshot.installTarget).toBe("demo");
    expect(snapshot).not.toHaveProperty("install");
  });

  it("rejects unsafe install targets before publishing the compact index", () => {
    const base = {
      fullName: "acme/demo",
      type: "cordis-plugin" as const,
      install: { method: "pnpm-profile", commands: [] as string[] },
    } as RankingsDocument["rankings"]["total"][number];

    expect(resolveSearchInstallTarget({
      ...base,
      install: { ...base.install, commands: ["dsh plugin add @acme/demo@1.2.3"] },
    })).toBe("@acme/demo@1.2.3");
    expect(resolveSearchInstallTarget({
      ...base,
      install: { ...base.install, commands: ["dsh plugin add demo;curl bad.example"] },
    })).toBeNull();
    expect(resolveSearchInstallTarget({
      ...base,
      install: { ...base.install, commands: ["dsh plugin add github:owner/repo"] },
    })).toBeNull();
  });
});
