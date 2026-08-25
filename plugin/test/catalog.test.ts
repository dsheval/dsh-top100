import { describe, expect, it } from "vitest";
import { filterCatalog, matchesQuery } from "../src/host/catalog.js";
import type { RankingEntry, RankingsDocument } from "../src/shared/types.js";

function entry(fullName: string, extra: Partial<RankingEntry> = {}): RankingEntry {
  return {
    rank: extra.rank ?? 1,
    fullName,
    name: fullName.split("/")[1] ?? fullName,
    owner: fullName.split("/")[0] ?? "owner",
    description: extra.description ?? "English summary",
    descriptionZh: extra.descriptionZh ?? "中文简介",
    stars: extra.stars ?? 10,
    dailyStars: 0,
    weeklyStars: extra.weeklyStars ?? 0,
    hotScore: 1,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: extra.topics ?? [],
    tags: extra.tags ?? [],
    type: extra.type ?? "skill",
    sources: [],
    url: `https://github.com/${fullName}`,
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const document: RankingsDocument = {
  schemaVersion: 1,
  generatedAt: "2026-08-22T00:00:00.000Z",
  snapshotDate: "2026-08-22",
  rankings: {
    hot: [entry("acme/hot-one", { rank: 1, type: "cordis-plugin" })],
    rising: [entry("acme/rise-one", { rank: 1, tags: ["memory"] })],
    total: [
      entry("acme/hot-one", { rank: 2, type: "cordis-plugin" }),
      entry("acme/rise-one", { rank: 3, tags: ["memory"] }),
      entry("other/search-me", { rank: 4, descriptionZh: "检索助手" }),
    ],
  },
};

describe("catalog filter", () => {
  it("returns the selected view when there is no query", () => {
    const result = filterCatalog(document, {
      view: "hot",
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.fullName).toBe("acme/hot-one");
    expect(result.items[0]?.installable).toBe(true);
  });

  it("searches the full catalog once a query is present", () => {
    const result = filterCatalog(document, {
      view: "hot",
      category: null,
      query: "检索",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["other/search-me"]);
  });

  it("paginates and marks installed github specs", () => {
    const result = filterCatalog(document, {
      view: "total",
      category: null,
      query: "",
      offset: 1,
      limit: 1,
      installed: { "rise-one": "github:acme/rise-one" },
    });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(matchesQuery(document.rankings.total[1], "memory")).toBe(true);
  });

  it("uses the same category assignments as the published website data", () => {
    const categorized: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/agent", { categories: [{ id: "ai", confidence: 0.9, evidence: "Agent", source: "deepseek" }] }),
          entry("acme/tool", { categories: [{ id: "tools", confidence: 0.8, evidence: "Workflow", source: "deepseek" }] }),
        ],
      },
    };
    const result = filterCatalog(categorized, {
      view: "category",
      category: "tools",
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/tool"]);
  });

  it("ranks exact name matches above summary-only matches", () => {
    const ranked: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/general-tool", { rank: 1, descriptionZh: "提供项目搜索能力" }),
          entry("acme/search", { rank: 90, descriptionZh: "通用插件" }),
        ],
      },
    };
    const result = filterCatalog(ranked, {
      view: "total",
      category: null,
      query: "search",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual([
      "acme/search",
      "acme/general-tool",
    ]);
    expect(result.items[0]?.rank).toBe(90);
  });

  it("understands natural-language filler, bilingual synonyms, and a typo", () => {
    const vision = entry("acme/visual-reader", {
      description: "Extract OCR evidence from images",
      topics: ["vision"],
    });
    expect(matchesQuery(vision, "我想找一个图片处理插件")).toBe(true);
    expect(matchesQuery(entry("acme/search-tool"), "serach")).toBe(true);
  });
});
