import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRankingPublication } from "../../collector/src/publish-rankings.js";
import type { RankingEntry, RankingsDocument } from "../../collector/src/rankings.js";
import { installCommand } from "../../web/public/catalog-presentation.js";
import { resolveInstallSpec } from "../src/install/install-spec.js";
import {
  findPublishedEntry,
  invalidateCatalog,
  loadSearchRankings,
  loadSkillRankings,
  parseRankingSearchDocument,
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
      packageName: "@acme/catalog",
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
  it.each([
    { fullName: "e2mcc/dsh-popout-sidebar", packageName: undefined, target: "github:e2mcc/dsh-popout-sidebar" },
    { fullName: "acme/catalog", packageName: "@acme/catalog", target: "@acme/catalog@latest" },
  ])("keeps $target bound to its project across publication, website and plugin", ({ fullName, packageName, target }) => {
    const document = publishedDocument();
    const item = document.rankings.total[0];
    item.fullName = fullName;
    item.install = {
      packageName,
      commands: ["dsh plugin add dshmarket", `dsh plugin add ${target}`],
    };
    const publication = buildRankingPublication(document);
    const raw = publication.files.find((file) => file.relativePath === "search.json")!.content;
    const published = JSON.parse(raw).rankings[0];
    const consumed = parseRankingSearchDocument(raw).rankings.total[0];
    expect(published.installTarget).toBe(target);
    expect(installCommand(published)).toBe(`npx @deepseek-ai/dsh plugin --profile web add ${target}`);
    expect(resolveInstallSpec(consumed)?.spec).toBe(target);
  });

  it("keeps stale or mismatched compact npm targets browse-only in both consumers", () => {
    for (const installPackageName of [undefined, "@acme/catalog"]) {
      const stale = {
        ...publishedDocument().rankings.total[0],
        install: undefined,
        installTarget: "dshmarket",
        installPackageName,
      };
      const consumed = parseRankingSearchDocument(JSON.stringify({ rankings: [stale] })).rankings.total[0];
      expect(installCommand(stale)).toBeNull();
      expect(resolveInstallSpec(consumed)).toBeNull();
    }
  });

  async function freshPublication() {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-locator-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = buildRankingPublication(publishedDocument(), { publicUrlPrefix: "/data" });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/manifest.json")) return new Response(JSON.stringify(publication.manifest));
      const file = publication.files.find((file) => url.endsWith(`/snapshots/${publication.manifest.snapshotId}/${file.relativePath}`));
      return file ? new Response(file.content) : new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { publication, fetchMock, locator: { snapshotId: publication.manifest.snapshotId, totalRank: 1 } };
  }

  it("discards old parsed caches that fabricated zero growth for compact search entries", async () => {
    const { publication, fetchMock } = await freshPublication();
    const url = `https://catalog.example${publication.manifest.datasets.search.url}`;
    const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
    const directory = process.env.DSH_TOP100_CACHE_DIR!;
    await mkdir(directory, { recursive: true });
    const stale = publishedDocument();
    stale.rankings.total[0].dailyStars = 0;
    stale.rankings.total[0].weeklyStars = 0;
    await writeFile(join(directory, `${key}.json`), JSON.stringify({
      schemaVersion: 1, dataUrl: url, fetchedAt: Date.now(), document: stale,
    }));
    const search = await loadSearchRankings("https://catalog.example/data");
    expect(search.rankings.total[0]).toMatchObject({ dailyStars: null, weeklyStars: null, hotScore: null });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(url);
  });

  it("keeps Skills from older v2 publications installable through their legacy directory", async () => {
    const { publication, fetchMock } = await freshPublication();
    const original = fetchMock.getMockImplementation()!;
    const { skills: _skills, ...datasets } = publication.manifest.datasets;
    const document = publishedDocument();
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/manifest.json")) return new Response(JSON.stringify({ ...publication.manifest, datasets }));
      if (String(input).endsWith("/rankings.json")) return new Response(JSON.stringify({
        ...document, rankings: { ...document.rankings, total: [...document.rankings.total, ...document.directories!.skills] },
      }));
      return original(input);
    });
    await expect(findPublishedEntry("https://catalog.example/data", "acme/skill"))
      .resolves.toMatchObject({ fullName: "acme/skill", type: "skill" });
  });

  it("resolves a visible plugin using only the current manifest and its authoritative page", async () => {
    const { publication, fetchMock, locator } = await freshPublication();
    await expect(findPublishedEntry("https://catalog.example/data", "acme/catalog", true, locator))
      .resolves.toMatchObject({ fullName: "acme/catalog", dailyStars: 5, weeklyStars: 20 });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://catalog.example/data/manifest.json",
      `https://catalog.example${publication.manifest.datasets.total.pages[0].url}`,
    ]);
  });

  it.each(["stale-snapshot", "wrong-plugin", "invalid-rank"])("rejects a %s locator without broadening the download", async (reason) => {
    const { fetchMock, locator } = await freshPublication();
    if (reason === "stale-snapshot") locator.snapshotId = "old";
    if (reason === "invalid-rank") locator.totalRank = 0;
    await expect(findPublishedEntry("https://catalog.example/data", reason === "wrong-plugin" ? "acme/other" : "acme/catalog", true, locator))
      .rejects.toThrow(/刷新列表/);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/search\.json|rankings\.json/),
    ]));
  });

  it("does not downgrade installation validation after a page integrity failure", async () => {
    const { fetchMock, locator } = await freshPublication();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input) => String(input).endsWith("/manifest.json")
      ? original(input) : new Response('{"tampered":true}'));
    await expect(findPublishedEntry("https://catalog.example/data", "acme/catalog", true, locator))
      .rejects.toThrow("完整性");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails promptly on manifest timeout instead of downloading the legacy full catalog", async () => {
    const { fetchMock, locator } = await freshPublication();
    fetchMock.mockRejectedValue(new DOMException("request timed out", "TimeoutError"));
    await expect(findPublishedEntry("https://catalog.example/data", "acme/catalog", true, locator))
      .rejects.toThrow(/timed out|超时/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a caller waiting for a shared manifest without starting a page lookup", async () => {
    const { fetchMock, locator, publication } = await freshPublication();
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const controller = new AbortController();
    const request = findPublishedEntry("https://catalog.example/data", "acme/catalog", true, locator, controller.signal);
    const outcome = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    await outcome;
    release(new Response(JSON.stringify(publication.manifest)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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
      dailyStars: null, weeklyStars: null, hotScore: null,
      install: { packageName: "@acme/catalog", commands: ["dsh plugin add @acme/catalog"] },
    });
    await expect(findPublishedEntry("https://catalog.example/data", "acme/catalog"))
      .resolves.toMatchObject({
        fullName: "acme/catalog",
        install: { packageName: "@acme/catalog", commands: ["dsh plugin --profile web add @acme/catalog"] },
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
