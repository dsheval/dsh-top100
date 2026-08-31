import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeCatalogFetchError,
  filterCatalog,
  findPublishedEntry,
  invalidateCatalog,
  isRetryableCatalogFetchError,
  loadCachedRankings,
  loadRankingView,
  loadRankings,
  loadSearchRankings,
  matchesQuery,
  parseRankingViewDocument,
  parseRankingSearchDocument,
  parseRankingsDocument,
} from "../src/host/catalog.js";
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
    hot: [entry("acme/hot-one", {
      rank: 1,
      type: "cordis-plugin",
      install: { method: "pnpm-profile", commands: ["dsh plugin --profile web add @acme/hot-one"] },
    })],
    rising: [entry("acme/rise-one", { rank: 1, tags: ["memory"] })],
    total: [
      entry("acme/hot-one", {
        rank: 2,
        type: "cordis-plugin",
        install: { method: "pnpm-profile", commands: ["dsh plugin --profile web add @acme/hot-one"] },
      }),
      entry("acme/rise-one", { rank: 3, tags: ["memory"] }),
      entry("other/search-me", { rank: 4, descriptionZh: "检索助手" }),
    ],
  },
};

const temporaryCaches: string[] = [];
const originalCacheDirectory = process.env.DSH_TOP100_CACHE_DIR;

afterEach(async () => {
  invalidateCatalog();
  vi.unstubAllGlobals();
  if (originalCacheDirectory === undefined) delete process.env.DSH_TOP100_CACHE_DIR;
  else process.env.DSH_TOP100_CACHE_DIR = originalCacheDirectory;
  await Promise.all(temporaryCaches.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

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

  it("does not advertise one-click install without an explicit trusted add target", () => {
    const result = filterCatalog({
      ...document,
      rankings: { ...document.rankings, hot: [entry("acme/browse-only", { type: "cordis-plugin" })] },
    }, {
      view: "hot",
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items[0]?.installable).toBe(false);
    expect(result.items[0]?.installSpec).toBeNull();
  });

  it("can hide Skill entries without changing the category taxonomy", () => {
    const result = filterCatalog(document, {
      view: "total",
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
      excludeSkills: true,
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/hot-one"]);
  });

  it("keeps ecosystem candidates out of the default compatible scope", () => {
    const scoped: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/plugin", { type: "cordis-plugin" }),
          entry("acme/desktop", { type: "project", description: "Electron desktop app for DSH" }),
        ],
      },
    };
    const result = filterCatalog(scoped, {
      view: "total", category: null, query: "", offset: 0, limit: 10, installed: {}, compatibleOnly: true,
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/plugin"]);
    expect(result.items[0]?.evidence).toMatchObject({ formFactor: "dsh-bundle", trustLevel: "structured" });
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

describe("catalog transport", () => {
  it("recognizes certificate failures that Windows may retry", () => {
    const cause = Object.assign(new Error("unable to verify the first certificate"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
    const error = new Error("fetch failed", { cause });
    expect(isRetryableCatalogFetchError(error)).toBe(true);
    expect(describeCatalogFetchError(error)).toContain("证书校验失败");
  });

  it("turns transport failures into actionable Chinese messages", () => {
    expect(describeCatalogFetchError(new Error("The operation was aborted due to timeout")))
      .toContain("榜单请求超时");
    expect(describeCatalogFetchError(new Error("rankings fetch failed: 502 Bad Gateway")))
      .toBe("榜单服务器请求失败（HTTP 502 Bad Gateway）");
    expect(describeCatalogFetchError(new Error("fetch failed"))).toContain("网络连接失败");
  });

  it("validates downloaded rankings JSON before caching it", () => {
    expect(parseRankingsDocument(JSON.stringify(document)).rankings.total).toHaveLength(3);
    expect(() => parseRankingsDocument("<html>bad gateway</html>")).toThrow("not valid JSON");
    expect(() => parseRankingsDocument("{}")).toThrow("rankings.total");
  });

  it("normalizes a small published view shard into the catalog shape", () => {
    const shard = parseRankingViewDocument(JSON.stringify({
      ...document,
      rankings: document.rankings.hot,
    }), "hot");
    expect(shard.rankings.hot).toHaveLength(1);
    expect(shard.rankings.total).toBe(shard.rankings.hot);
    expect(shard.rankings.rising).toEqual([]);
  });

  it("normalizes the compact search index without requiring full ranking fields", () => {
    const search = parseRankingSearchDocument(JSON.stringify({
      schemaVersion: 2,
      generatedAt: document.generatedAt,
      snapshotDate: document.snapshotDate,
      rankings: [{ rank: 1, fullName: "acme/compact", descriptionZh: "轻量检索", type: "skill" }],
    }));
    expect(search.rankings.total[0]).toMatchObject({
      fullName: "acme/compact",
      description: "",
      descriptionZh: "轻量检索",
      stars: 0,
    });
  });

  it("uses the compact search index for all-entry search", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 2,
      generatedAt: document.generatedAt,
      snapshotDate: document.snapshotDate,
      rankings: document.rankings.total,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadSearchRankings("https://catalog.example/data"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://catalog.example/data/rankings-search.json");
  });

  it("falls back to the full catalog when the compact index is temporarily unavailable", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503, statusText: "Unavailable" }))
      .mockResolvedValueOnce(new Response(JSON.stringify(document), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSearchRankings("https://catalog.example/data"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/rankings-search.json",
      "https://catalog.example/data/rankings.json",
    ]);
  });

  it("coalesces initial shard downloads and reuses the persistent cache", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...document,
      rankings: document.rankings.hot,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const [left, right] = await Promise.all([
      loadRankingView("https://catalog.example/data", "hot"),
      loadRankingView("https://catalog.example/data", "hot"),
    ]);
    expect(left.rankings.hot).toHaveLength(1);
    expect(right.rankings.hot).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://catalog.example/data/rankings-hot.json");

    invalidateCatalog();
    const offlineFetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", offlineFetch);
    await expect(loadCachedRankings("https://catalog.example/data"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    await expect(loadRankingView("https://catalog.example/data", "hot"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(offlineFetch).not.toHaveBeenCalled();
  });

  it("falls back to the full catalog when a view shard is not JSON", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html>upstream warning</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(document), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadRankingView("https://catalog.example/data", "hot"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/rankings-hot.json",
      "https://catalog.example/data/rankings.json",
    ]);
  });

  it("treats a newer full catalog omission as authoritative for installation", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const target = document.rankings.hot[0];
    const oldShard = { ...document, generatedAt: "2026-08-21T00:00:00.000Z", rankings: [target] };
    const newFull = {
      ...document,
      generatedAt: "2026-08-22T00:00:00.000Z",
      rankings: { hot: [], rising: [], total: document.rankings.total.filter((entry) => entry.fullName !== target.fullName) },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(oldShard), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(newFull), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await loadRankingView("https://catalog.example/data", "hot", true);
    await loadRankings("https://catalog.example/data", true);
    await expect(findPublishedEntry("https://catalog.example/data", target.fullName))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
