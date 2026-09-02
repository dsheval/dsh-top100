import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRankingPublication } from "../../collector/src/publish-rankings.js";
import type { RankingEntry, RankingsDocument } from "../../collector/src/rankings.js";
import {
  findPublishedEntry,
  invalidateCatalog,
  loadSearchRankings,
  loadSkillRankings,
} from "../src/host/catalog.js";

const temporaryCaches: string[] = [];
const originalCacheDirectory = process.env.DSH_TOP100_CACHE_DIR;

afterEach(async () => {
  invalidateCatalog();
  vi.unstubAllGlobals();
  if (originalCacheDirectory === undefined) delete process.env.DSH_TOP100_CACHE_DIR;
  else process.env.DSH_TOP100_CACHE_DIR = originalCacheDirectory;
  await Promise.all(temporaryCaches.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function publishedDocument(): RankingsDocument {
  const entry: RankingEntry = {
    rank: 1,
    totalRank: 1,
    fullName: "acme/catalog",
    name: "catalog",
    owner: "acme",
    description: "Published plugin",
    descriptionZh: "发布目录插件",
    stars: 100,
    dailyStars: 5,
    weeklyStars: 20,
    hotScore: 88,
    forks: 2,
    openIssues: 0,
    language: "TypeScript",
    homepage: null,
    license: "MIT",
    topics: ["dsh"],
    tags: ["tools"],
    categories: [{
      id: "tools",
      confidence: 1,
      evidence: "fixture",
      source: "manual",
    }],
    type: "cordis-plugin",
    install: {
      method: "pnpm-profile",
      needsConfig: false,
      commands: ["dsh plugin --profile web add @acme/catalog"],
    },
    sources: ["github"],
    url: "https://github.com/acme/catalog",
    pushedAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
  const skill: RankingEntry = {
    ...entry,
    rank: 1,
    totalRank: 1,
    fullName: "acme/skill",
    name: "skill",
    description: "Published Skill",
    descriptionZh: "发布目录技能",
    type: "skill",
    install: undefined,
    url: "https://github.com/acme/skill",
  };
  return {
    schemaVersion: 2,
    generatedAt: "2026-08-31T00:00:00.000Z",
    snapshotDate: "2026-08-31",
    definitions: { total: "stars", rising: "growth", hot: "composite" },
    categories: [{ id: "tools", label: "工具", description: "效率工具", count: 1 }],
    rankings: { total: [entry], hot: [entry], rising: [entry] },
    directories: { skills: [skill] },
  };
}

describe("collector to plugin manifest contract", () => {
  it("loads the real v2 search snapshot and resolves installation from one total page", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-publication-contract-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = buildRankingPublication(publishedDocument(), {
      publicUrlPrefix: "/data",
    });
    const prefix = `/data/snapshots/${publication.manifest.snapshotId}/`;
    const responses = new Map<string, string>([
      ["https://catalog.example/data/manifest.json", `${JSON.stringify(publication.manifest)}\n`],
      ...publication.files.map(({ relativePath, content }) => [
        `https://catalog.example${prefix}${relativePath}`,
        content,
      ] as const),
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const raw = responses.get(url);
      return raw === undefined
        ? new Response("not found", { status: 404, statusText: "Not Found" })
        : new Response(raw, { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const search = await loadSearchRankings("https://catalog.example/data");
    expect(search.rankings.total[0]).toMatchObject({
      fullName: "acme/catalog",
      install: { commands: ["dsh plugin add @acme/catalog"] },
    });
    await expect(findPublishedEntry("https://catalog.example/data", "acme/catalog"))
      .resolves.toMatchObject({
        fullName: "acme/catalog",
        install: { commands: ["dsh plugin --profile web add @acme/catalog"] },
      });
    await expect(loadSkillRankings("https://catalog.example/data"))
      .resolves.toMatchObject({ rankings: { total: [{ fullName: "acme/skill", type: "skill" }] } });
    await expect(findPublishedEntry("https://catalog.example/data", "acme/skill"))
      .resolves.toMatchObject({ fullName: "acme/skill", type: "skill" });
    expect(fetchMock.mock.calls.map((call) => call[0])).not.toContain(
      "https://catalog.example/data/rankings.json",
    );
  });
});
