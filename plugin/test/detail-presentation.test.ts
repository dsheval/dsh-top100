import { describe, expect, it } from "vitest";
import type { RankingEntry } from "../src/shared/types.js";
import { mergeDetailPreservingViewRank } from "../src/client/detail-presentation.js";

function entry(rank: number, stars: number): RankingEntry {
  return {
    rank,
    fullName: "acme/plugin",
    name: "plugin",
    owner: "acme",
    description: "Plugin",
    descriptionZh: "插件",
    stars,
    dailyStars: 2,
    weeklyStars: 10,
    hotScore: 88,
    forks: 4,
    openIssues: 1,
    language: "TypeScript",
    homepage: null,
    license: "MIT",
    topics: [],
    tags: [],
    type: "plugin",
    sources: [],
    url: "https://github.com/acme/plugin",
    pushedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

describe("mergeDetailPreservingViewRank", () => {
  it("enriches detail fields without replacing the active-view rank", () => {
    const merged = mergeDetailPreservingViewRank(entry(1, 100), entry(11, 3722));

    expect(merged.rank).toBe(1);
    expect(merged.stars).toBe(3722);
  });
});
