import { describe, expect, it } from "vitest";
import reviewed from "../src/shared/reviewed-descriptions.json";
import { descriptionFor } from "../src/shared/description-rules.js";
import { withReviewedDescription } from "../src/shared/descriptions.js";
import { filterCatalog } from "../src/host/catalog.js";
import { recommendationResult } from "../src/host/recommendations.js";
import type { RankingEntry, RankingsDocument } from "../src/shared/types.js";

function sample(): RankingEntry {
  const fullName = "nexu-io/open-design";
  const review = reviewed[fullName];
  return {
    fullName, name: "open-design", owner: "nexu-io", rank: 1,
    description: review.sourceDescription, readmeSummary: review.sourceReadme,
    descriptionZh: "现有项目资料不足以生成可靠的功能简介。",
    stars: 100, dailyStars: 1, weeklyStars: 7, hotScore: 90, forks: 0, openIssues: 0,
    language: null, homepage: null, license: null, topics: [], tags: [],
    type: "cordis-plugin", sources: [], url: `https://github.com/${fullName}`,
    pushedAt: "", createdAt: "", updatedAt: "",
  };
}
function document(entry: RankingEntry, snapshotId?: string): RankingsDocument {
  return { schemaVersion: 2, snapshotId, generatedAt: "2026-09-04T06:02:14.458Z", snapshotDate: "2026-09-04",
    rankings: { total: [entry], hot: [entry], rising: [entry] } };
}
const options = { view: "total" as const, category: null, query: "视觉素材", offset: 0, limit: 10, installed: {} };

describe("shared editorial descriptions", () => {
  it("ships all 279 source-bound summaries and preserves the evidence", () => {
    expect(Object.keys(reviewed)).toHaveLength(279);
    for (const [fullName, review] of Object.entries(reviewed)) {
      const entry = { ...sample(), fullName, description: review.sourceDescription, readmeSummary: review.sourceReadme };
      const result = withReviewedDescription(entry);
      expect(result.descriptionZh, fullName).toBe(review.descriptionZh);
      expect(result.description).toBe(entry.description);
      expect(result.readmeSummary).toBe(entry.readmeSummary);
      expect(entry.descriptionZh).toContain("资料不足");
    }
  });

  it("accepts compact entries only for the exact reviewed snapshot", () => {
    const entry = sample();
    delete entry.readmeSummary;
    const review = reviewed[entry.fullName as keyof typeof reviewed];
    expect(withReviewedDescription(entry, { snapshotId: review.snapshotId }).descriptionZh).toBe(review.descriptionZh);
    expect(withReviewedDescription(entry).descriptionZh).not.toBe(review.descriptionZh);
    expect(withReviewedDescription(entry, { snapshotId: "new-snapshot" }).descriptionZh).not.toBe(review.descriptionZh);
    expect(withReviewedDescription({ ...entry, readmeSummary: "Changed behavior" }, { snapshotId: review.snapshotId }).descriptionZh).not.toBe(review.descriptionZh);
    expect(withReviewedDescription({ ...entry, description: "Changed project" }, { snapshotId: review.snapshotId }).descriptionZh).not.toBe(review.descriptionZh);
  });

  it("searches and returns the same text in full lists and compact Agent recommendations", () => {
    const entry = sample();
    const expected = reviewed[entry.fullName as keyof typeof reviewed].descriptionZh;
    for (const view of ["hot", "rising", "total"] as const) {
      expect(filterCatalog(document(entry), { ...options, view }).items[0].descriptionZh).toBe(expected);
    }
    delete entry.readmeSummary;
    const compact = document(entry, reviewed[entry.fullName as keyof typeof reviewed].snapshotId);
    expect(recommendationResult(compact, { query: options.query }).items[0].description).toBe(expected);
    expect(entry.descriptionZh).toContain("资料不足");
  });

  it("applies the same presentation to the separate Skills directory", () => {
    const entry = { ...sample(), type: "skill" };
    expect(filterCatalog(document(entry), { ...options, catalogScope: "skills" }).items[0].descriptionZh).toBe(reviewed["nexu-io/open-design"].descriptionZh);
    expect(filterCatalog(document(entry), { ...options, catalogScope: "plugins" }).items).toHaveLength(0);
  });

  it("removes placeholder and markup fragments without inventing capabilities", () => {
    expect(descriptionFor({ descriptionZh: "资料不足", description: "<script>secret()</script>**Browser** [tools](https://example.org)" })).toBe("Browser tools");
    expect(descriptionFor({ descriptionZh: "求 Star", description: "" })).toBe("暂无简介");
  });
});
