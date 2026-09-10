import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshPlugin, MarketData } from "@dsh-top100/schema";
import type { RankingEntry, RankingsDocument } from "../src/rankings.js";
import { bindCategoryAssignments } from "../src/categories.js";
import * as editorial from "../src/editorial.js";
import { mergeCatalogContent, mergeCatalogContentCli } from "../src/merge-catalog-content.js";

const temporary: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function plugin(): DshPlugin {
  return {
    id: "acme/research", fullName: "acme/research", type: "cordis-plugin", name: "research", owner: "acme", repo: "research",
    description: "Search papers and retrieve citations.", readmeSummary: "Search academic papers with cited sources.",
    descriptionZh: "原有的中文介绍与标签。", topics: ["research"], tags: ["原有标签"], stars: 123, forks: 4, openIssues: 1,
    language: "TypeScript", homepage: null, license: "MIT", curated: false,
    pushedAt: "2026-09-01", createdAt: "2026-01-01", updatedAt: "2026-09-02", lastCheckedAt: "2026-09-03",
    install: { method: "pnpm-profile", packageName: "@acme/research", repositoryPath: "packages/research", needsConfig: true,
      commands: ["dsh plugin add @acme/research@1.0.0"] }, sources: ["original-source"],
    score: { total: 42, confidence: 0.8, explanation: "original score", breakdown: { maintain: 1, practical: 2, popularity: 3, ease: 4, signal: 5 } },
  };
}
function fixture() {
  const original = { ...plugin(), descriptionZh: "中文简介待生成。" };
  const source = { schemaVersion: 2, generatedAt: "2026-09-01", plugins: [original], packs: [], preservedMetadata: { revision: 7 } } as MarketData;
  const improved = {
    ...structuredClone(original), rank: 1, totalRank: 1, dailyStars: 9, weeklyStars: 19, hotScore: 99,
    descriptionZh: "检索学术论文并整理可核对的引用来源。", tags: ["学术研究", "引用检索"], stars: 999, sources: ["enriched"],
    pushedAt: "2026-09-09", createdAt: "2026-02-02", updatedAt: "2026-09-09", url: "https://github.com/acme/research",
    install: { ...original.install, commands: ["dsh plugin add @acme/research@9.0.0"], needsConfig: false },
  } as RankingEntry;
  improved.categories = bindCategoryAssignments(improved, [{ id: "knowledge", confidence: 0.95, evidence: "明确提供论文与引用检索", source: "deepseek" }]);
  const enriched = { schemaVersion: 2, generatedAt: "2026-09-10", snapshotDate: "2026-09-10", definitions: {}, categories: [],
    rankings: { total: [improved], hot: [], rising: [] }, directories: { skills: [] } } as RankingsDocument;
  return { source, enriched, improved };
}

describe("content-only market merge", () => {
  it("copies only valid content and preserves market metadata, packs, collection evidence and both inputs", () => {
    const { source, enriched, improved } = fixture();
    source.packs = [{ id: "preserved-pack", arbitrary: true }] as unknown as MarketData["packs"];
    const beforeSource = structuredClone(source), beforeEnriched = structuredClone(enriched);
    const result = mergeCatalogContent(source, enriched);
    expect(result.stats).toEqual({ matched: 1, applied: 1, "skipped-source-change": 0, missing: 0 });
    expect(result.market).toEqual({ ...source, plugins: [{ ...source.plugins[0], descriptionZh: improved.descriptionZh,
      tags: improved.tags, categories: improved.categories }] });
    expect(source).toEqual(beforeSource);
    expect(enriched).toEqual(beforeEnriched);
  });

  it.each(["type", "name", "description", "readmeSummary", "topics", "packageName", "repositoryPath"] as const)("skips all content when %s source identity changed", field => {
    const { source, enriched } = fixture();
    const entry = enriched.rankings.total[0];
    if (field === "packageName" || field === "repositoryPath") entry.install[field] = "changed-package";
    else if (field === "topics") entry.topics = ["changed-topic"];
    else entry[field] = "changed-source";
    const result = mergeCatalogContent(source, enriched);
    expect(result.stats).toEqual({ matched: 0, applied: 0, "skipped-source-change": 1, missing: 0 });
    expect(result.market).toEqual(source);
  });

  it("matches repository casing and includes the separate Skills directory", () => {
    const { source, enriched, improved } = fixture();
    source.plugins[0].type = "skill";
    improved.type = "skill";
    improved.fullName = "ACME/Research";
    enriched.rankings.total = [];
    enriched.directories.skills = [improved];
    expect(mergeCatalogContent(source, enriched).stats).toMatchObject({ matched: 1, applied: 1, missing: 0 });
  });

  it.each(["中文简介待生成。", "A useful plugin for searching papers.", "", "暂无简介"])("never replaces valid source descriptions or tags with %s", descriptionZh => {
    const { source, enriched } = fixture();
    source.plugins[0].descriptionZh = plugin().descriptionZh;
    enriched.rankings.total[0].descriptionZh = descriptionZh;
    enriched.rankings.total[0].categories = [];
    const result = mergeCatalogContent(source, enriched);
    expect(result.stats).toMatchObject({ matched: 1, applied: 0 });
    expect(result.market).toEqual(source);
  });

  it.each(["fallback", "old-policy", "wrong-source", "empty-evidence", "absent"])("does not merge unfinished or invalid classifications: %s", variant => {
    const { source, enriched } = fixture();
    const originalCategories = bindCategoryAssignments(source.plugins[0], [{ id: "tools", confidence: 0.9, evidence: "原有有效分类", source: "deepseek" }]);
    source.plugins[0].categories = originalCategories;
    const candidate = enriched.rankings.total[0];
    candidate.descriptionZh = "中文简介待生成。";
    if (variant === "fallback") candidate.categories[0].source = "rule-fallback";
    if (variant === "old-policy") candidate.categories[0].policyVersion = 0;
    if (variant === "wrong-source") candidate.categories[0].sourceHash = "stale-source";
    if (variant === "empty-evidence") candidate.categories[0].evidence = "";
    if (variant === "absent") candidate.categories = [];
    const result = mergeCatalogContent(source, enriched);
    expect(result.market.plugins[0].categories).toEqual(originalCategories);
    expect(result.stats.applied).toBe(0);
  });

  it("copies valid classification independently and excludes any accompanying fallback category", () => {
    const { source, enriched, improved } = fixture();
    improved.descriptionZh = "中文简介待生成。";
    improved.categories.push(...bindCategoryAssignments(improved, [{ id: "tools", confidence: 0.6, evidence: "关键词兜底", source: "rule-fallback" }]));
    const result = mergeCatalogContent(source, enriched);
    expect(result.market.plugins[0].descriptionZh).toBe(source.plugins[0].descriptionZh);
    expect(result.market.plugins[0].tags).toEqual(source.plugins[0].tags);
    expect(result.market.plugins[0].categories).toEqual([improved.categories[0]]);
  });

  it("preserves later source Chinese and tags against an older same-source candidate", () => {
    const { source, enriched } = fixture();
    source.plugins[0].descriptionZh = "后来人工修正的中文介绍，已经明确只描述所选子包。";
    source.plugins[0].tags = ["后来人工修正的标签"];
    enriched.rankings.total[0].categories = [];
    const before = structuredClone(source);
    const result = mergeCatalogContent(source, enriched);
    expect(result.market).toEqual(before);
    expect(result.stats).toEqual({ matched: 1, applied: 0, "skipped-source-change": 0, missing: 0 });
    expect(source).toEqual(before);
  });

  it.each(["deepseek", "manual"] as const)("prefers current canonical reviews to stale %s content in either input", candidateSource => {
    const { source, enriched, improved } = fixture();
    source.plugins[0].descriptionZh = "源文件中保留的较早中文介绍。";
    source.plugins[0].categories = bindCategoryAssignments(source.plugins[0], [{ id: "coding", confidence: 0.9, evidence: "较早人工分类", source: "manual" }]);
    improved.categories[0].source = candidateSource;
    const canonicalDescription = "当前人工复核确认的中文介绍，优先于两个较早快照。";
    const canonicalCategories = bindCategoryAssignments(source.plugins[0], [{ id: "tools", confidence: 0.98, evidence: "当前人工核对的用途", source: "manual" }]);
    const reviewText = vi.spyOn(editorial, "reviewedDescription").mockReturnValue(canonicalDescription);
    const reviewCategories = vi.spyOn(editorial, "reviewedCategories").mockReturnValue(canonicalCategories);
    const beforeSource = structuredClone(source), beforeEnriched = structuredClone(enriched);
    const result = mergeCatalogContent(source, enriched);
    expect(result.market.plugins[0]).toEqual({ ...source.plugins[0], descriptionZh: canonicalDescription, categories: canonicalCategories });
    expect(result.market.plugins[0].tags).toEqual(source.plugins[0].tags);
    for (const reviewed of [reviewText, reviewCategories]) expect(reviewed).toHaveBeenCalledWith(expect.objectContaining({
      fullName: source.plugins[0].fullName, description: source.plugins[0].description, readmeSummary: source.plugins[0].readmeSummary,
      type: source.plugins[0].type, install: source.plugins[0].install,
    }));
    expect(result.stats.applied).toBe(1);
    expect(source).toEqual(beforeSource);
    expect(enriched).toEqual(beforeEnriched);
  });

  it.each(["deepseek", "manual"] as const)("protects current source manual categories from older %s candidates", candidateSource => {
    const { source, enriched, improved } = fixture();
    source.plugins[0].descriptionZh = plugin().descriptionZh;
    source.plugins[0].categories = bindCategoryAssignments(source.plugins[0], [{ id: "tools", confidence: 0.95, evidence: "后来人工修订分类", source: "manual" }]);
    improved.categories[0].source = candidateSource;
    const result = mergeCatalogContent(source, enriched);
    expect(result.market).toEqual(source);
    expect(result.stats.applied).toBe(0);
  });

  it("does not let stale manual policy prevent current valid model classifications from filling the result", () => {
    const { source, enriched, improved } = fixture();
    source.plugins[0].categories = bindCategoryAssignments(source.plugins[0], [{ id: "tools", confidence: 0.95, evidence: "过期的人工分类", source: "manual" }]);
    source.plugins[0].categories[0].policyVersion = 0;
    expect(mergeCatalogContent(source, enriched).market.plugins[0].categories).toEqual(improved.categories);
  });

  it("reports absent entries and is idempotent once valid content has been merged", () => {
    const { source, enriched } = fixture();
    source.plugins.push({ ...plugin(), id: "acme/missing", fullName: "acme/missing" });
    const result = mergeCatalogContent(source, enriched);
    expect(result.stats).toMatchObject({ matched: 1, applied: 1, missing: 1 });
    expect(mergeCatalogContent(result.market, enriched).stats).toMatchObject({ matched: 1, applied: 0, missing: 1 });
  });

  it("rejects ambiguous or malformed catalogs", () => {
    const { source, enriched, improved } = fixture();
    enriched.directories.skills.push({ ...improved, fullName: improved.fullName.toUpperCase() });
    expect(() => mergeCatalogContent(source, enriched)).toThrow("Duplicate enriched fullName");
    expect(() => mergeCatalogContent({} as MarketData, enriched)).toThrow("plugins array");
    expect(() => mergeCatalogContent(source, {} as RankingsDocument)).toThrow("rankings.total");
  });
});

describe("catalog merge CLI", () => {
  function paths() {
    const root = mkdtempSync(join(tmpdir(), "merge-catalog-content-"));temporary.push(root);
    const source = join(root, "source.json"), enriched = join(root, "enriched.json"), output = join(root, "new-output", "merged.json");
    const input = fixture();writeFileSync(source, JSON.stringify(input.source));writeFileSync(enriched, JSON.stringify(input.enriched));
    return { root, source, enriched, output };
  }
  it("dry-runs with statistics and no writes or network requests", async () => {
    const p = paths(), log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    await mergeCatalogContentCli([p.source, p.enriched, p.output, "--dry-run"]);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ dryRun: true, matched: 1, applied: 1, missing: 0, "skipped-source-change": 0 });
    expect(existsSync(join(p.root, "new-output"))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("writes a separate output and leaves both input files byte-for-byte unchanged", async () => {
    const p = paths();vi.spyOn(console, "log").mockImplementation(() => {});
    const before = [readFileSync(p.source, "utf8"), readFileSync(p.enriched, "utf8")];
    await mergeCatalogContentCli([p.source, p.enriched, p.output]);
    expect([readFileSync(p.source, "utf8"), readFileSync(p.enriched, "utf8")]).toEqual(before);
    expect(JSON.parse(readFileSync(p.output, "utf8")).plugins[0].descriptionZh).toBe(fixture().improved.descriptionZh);
  });
  it("refuses either input as output, including a symlink alias", async () => {
    const p = paths();
    for (const output of [p.source, p.enriched]) await expect(mergeCatalogContentCli([p.source, p.enriched, output])).rejects.toThrow("separate from both input");
    const alias = join(p.root, "alias.json");symlinkSync(p.source, alias);
    await expect(mergeCatalogContentCli([p.source, p.enriched, alias])).rejects.toThrow("separate from both input");
  });
});
