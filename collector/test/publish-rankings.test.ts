import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PluginCategoryId } from "@dsh-top100/schema";
import {
  buildRankingPublication,
  publishRankings,
  RANKING_PUBLICATION_FORMAT,
  validateRankingPublication,
} from "../src/publish-rankings.js";
import type { RankingEntry, RankingsDocument } from "../src/rankings.js";

const CATEGORY_IDS: PluginCategoryId[] = [
  "ai",
  "appearance",
  "coding",
  "knowledge",
  "tools",
  "security",
];

function rankingEntry(index: number, allInAi = false): RankingEntry {
  const totalRank = index + 1;
  const secondary = CATEGORY_IDS[index % CATEGORY_IDS.length];
  const categoryIds = allInAi && secondary !== "ai" ? ["ai" as const, secondary] : [secondary];
  return {
    rank: totalRank,
    totalRank,
    fullName: `owner-${index}/plugin-${index}`,
    name: `plugin-${index}`,
    owner: `owner-${index}`,
    description: `Plugin ${index}`,
    descriptionZh: `插件 ${index}`,
    stars: 50_000 - index,
    dailyStars: index % 7,
    weeklyStars: index % 23,
    hotScore: 80 - (index % 20),
    forks: index,
    openIssues: index % 5,
    language: "TypeScript",
    homepage: `https://example.com/${index}`,
    license: "MIT",
    topics: ["dsh", `topic-${index}`],
    tags: ["tools", `tag-${index}`],
    categories: categoryIds.map((id) => ({
      id,
      confidence: 0.9,
      evidence: "fixture",
      source: "manual" as const,
    })),
    type: "cordis-plugin",
    install: {
      method: "pnpm-profile",
      needsConfig: false,
      commands: [`dsh plugin add plugin-${index}`],
    },
    sources: ["github"],
    url: `https://github.com/owner-${index}/plugin-${index}`,
    pushedAt: "2026-08-30T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function rankingsDocument(count: number, allInAi = false): RankingsDocument {
  const total = Array.from({ length: count }, (_, index) => rankingEntry(index, allInAi));
  const hot = total.slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const rising = total.slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
  return {
    schemaVersion: 2,
    generatedAt: "2026-08-31T00:00:00.000Z",
    snapshotDate: "2026-08-31",
    definitions: { total: "total", rising: "rising", hot: "hot" },
    categories: CATEGORY_IDS.map((id) => ({
      id,
      label: id,
      description: `${id} category`,
      count: total.filter((entry) => entry.categories.some((category) => category.id === id)).length,
    })),
    rankings: { total, hot, rising },
  };
}

function payloadForUrl(
  publication: ReturnType<typeof buildRankingPublication>,
  url: string
): Record<string, unknown> {
  const marker = `/snapshots/${publication.manifest.snapshotId}/`;
  const relativePath = url.slice(url.indexOf(marker) + marker.length);
  const file = publication.files.find((candidate) => candidate.relativePath === relativePath);
  if (!file) throw new Error(`Fixture could not find ${relativePath}`);
  return JSON.parse(file.content) as Record<string, unknown>;
}

describe("v2 ranking publication", () => {
  it.each([
    { count: 0, pageCount: 0, lastPageCount: 0 },
    { count: 1, pageCount: 1, lastPageCount: 1 },
    { count: 100, pageCount: 1, lastPageCount: 100 },
    { count: 101, pageCount: 2, lastPageCount: 1 },
    { count: 3414, pageCount: 35, lastPageCount: 14 },
  ])("paginates $count total entries at 100 per page", ({ count, pageCount, lastPageCount }) => {
    const publication = buildRankingPublication(rankingsDocument(count));
    const total = publication.manifest.datasets.total;
    expect(total).toMatchObject({ count, pageSize: 100, pageCount });
    expect(total.pages).toHaveLength(pageCount);
    expect(total.pages.at(-1)?.count ?? 0).toBe(lastPageCount);
    expect(total.pages.map(({ page }) => page)).toEqual(
      Array.from({ length: pageCount }, (_, index) => index + 1)
    );
  });

  it("publishes six independently paginated categories with continuous category ranks", () => {
    const publication = buildRankingPublication(rankingsDocument(205, true));
    expect(publication.manifest.categories.map(({ id }) => id)).toEqual(CATEGORY_IDS);

    const ai = publication.manifest.categories.find(({ id }) => id === "ai");
    expect(ai).toMatchObject({ count: 205, pageSize: 100, pageCount: 3 });
    expect(ai?.pages.map(({ count }) => count)).toEqual([100, 100, 5]);
    const entries = ai!.pages.flatMap(
      ({ url }) => payloadForUrl(publication, url).rankings as Array<{
        rank: number;
        totalRank: number;
        categories: PluginCategoryId[];
      }>
    );
    expect(entries.map(({ rank }) => rank)).toEqual(
      Array.from({ length: 205 }, (_, index) => index + 1)
    );
    expect(entries.map(({ totalRank }) => totalRank)).toEqual(
      Array.from({ length: 205 }, (_, index) => index + 1)
    );
    expect(entries.every((entry) => entry.categories.includes("ai"))).toBe(true);
  });

  it("hashes exact bytes and keeps snapshot metadata consistent", () => {
    const publication = buildRankingPublication(rankingsDocument(101));
    const references = [
      publication.manifest.datasets.hot,
      publication.manifest.datasets.rising,
      publication.manifest.datasets.search,
      ...publication.manifest.datasets.total.pages,
      ...publication.manifest.categories.flatMap(({ pages }) => pages),
    ];

    for (const reference of references) {
      const marker = `/snapshots/${publication.manifest.snapshotId}/`;
      const relativePath = reference.url.slice(reference.url.indexOf(marker) + marker.length);
      const file = publication.files.find((candidate) => candidate.relativePath === relativePath)!;
      expect(reference.bytes).toBe(Buffer.byteLength(file.content));
      expect(reference.sha256).toBe(createHash("sha256").update(file.content).digest("hex"));
      expect(payloadForUrl(publication, reference.url)).toMatchObject({
        schemaVersion: 2,
        snapshotId: publication.manifest.snapshotId,
        generatedAt: publication.manifest.generatedAt,
        snapshotDate: publication.manifest.snapshotDate,
      });
    }
    expect(publication.manifest.snapshotId).toMatch(/^2026-08-31-[a-f0-9]{16}$/);
    expect(RANKING_PUBLICATION_FORMAT).toBe("ranking-static-v2.1");
  });

  it("omits full-catalog-only fields from ranking pages and further trims search entries", () => {
    const publication = buildRankingPublication(rankingsDocument(1));
    const page = payloadForUrl(publication, publication.manifest.datasets.total.pages[0].url);
    const summary = (page.rankings as Array<Record<string, unknown>>)[0];
    expect(summary).toMatchObject({
      rank: 1,
      totalRank: 1,
      fullName: "owner-0/plugin-0",
      name: "plugin-0",
      categories: ["ai"],
      license: "MIT",
      pushedAt: "2026-08-30T00:00:00.000Z",
    });
    for (const field of [
      "forks",
      "openIssues",
      "language",
      "homepage",
      "sources",
      "createdAt",
      "updatedAt",
    ]) {
      expect(summary).not.toHaveProperty(field);
    }

    const search = payloadForUrl(publication, publication.manifest.datasets.search.url);
    const searchEntry = (search.rankings as Array<Record<string, unknown>>)[0];
    expect(searchEntry).toMatchObject({
      rank: 1,
      fullName: "owner-0/plugin-0",
      name: "plugin-0",
      tags: ["tools", "tag-0"],
      categories: ["ai"],
      stars: 50_000,
      type: "cordis-plugin",
      installTarget: "plugin-0",
    });
    for (const field of [
      "totalRank",
      "hotScore",
      "url",
      "owner",
      "forks",
      "openIssues",
      "dailyStars",
      "weeklyStars",
      "license",
      "topics",
      "install",
      "pushedAt",
    ]) {
      expect(searchEntry).not.toHaveProperty(field);
    }
  });

  it("rejects content that no longer matches a manifest hash", () => {
    const publication = buildRankingPublication(rankingsDocument(1));
    publication.files[0] = { ...publication.files[0], content: "{}\n" };
    expect(() => validateRankingPublication(publication)).toThrow(/hash or byte size mismatch/);
  });

  it("publishes immutable files, manifest, and legacy compatibility endpoints", () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-ranking-publication-"));
    try {
      const rankings = rankingsDocument(101);
      const first = publishRankings(rankings, directory);
      const second = publishRankings(rankings, directory);
      expect(second).toEqual(first);
      expect(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"))).toEqual(first);
      expect(
        JSON.parse(
          readFileSync(
            join(directory, "snapshots", first.snapshotId, "total", "page-002.json"),
            "utf8"
          )
        ).rankings
      ).toHaveLength(1);
      for (const filename of [
        "rankings.json",
        "rankings-total.json",
        "rankings-hot.json",
        "rankings-rising.json",
        "rankings-search.json",
      ]) {
        expect(JSON.parse(readFileSync(join(directory, filename), "utf8"))).toBeTruthy();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
