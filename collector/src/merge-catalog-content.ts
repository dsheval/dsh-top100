/** Merge reviewed/generated content back into a market snapshot without changing collection evidence. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { MarketData } from "@dsh-top100/schema";
import { currentCategoryAssignments, hasAuthoritativeCategories } from "./categories.js";
import { hasChineseDescription } from "./description-jobs.js";
import { reviewedDescription, reviewedCategories } from "./editorial.js";
import type { RankingEntry, RankingsDocument } from "./rankings.js";

export interface ContentMergeStats {
  /** Matching fullName and unchanged source identity, whether or not content changed. */
  matched: number;
  applied: number;
  "skipped-source-change": number;
  /** Market entries absent from the enriched total/Skills catalogs. */
  missing: number;
}

type ContentSource = Pick<RankingEntry, "fullName" | "name" | "type" | "description" | "topics" | "install"> & { readmeSummary?: string | null };
function sourceIdentity(entry: ContentSource): string {
  return JSON.stringify([
    entry.type, entry.name, entry.description ?? "", entry.readmeSummary ?? "", entry.topics ?? [],
    entry.install?.packageName ?? null, entry.install?.repositoryPath ?? null,
  ]);
}
function fullName(entry: unknown): string {
  if (!entry || typeof entry !== "object" || typeof (entry as { fullName?: unknown }).fullName !== "string"
    || !(entry as { fullName: string }).fullName.trim()) throw new Error("Every catalog entry must have a nonempty fullName");
  return (entry as { fullName: string }).fullName.toLowerCase();
}

export function mergeCatalogContent(source: MarketData, enriched: RankingsDocument): { market: MarketData; stats: ContentMergeStats } {
  if (!Array.isArray(source?.plugins)) throw new Error("Source market must contain a plugins array");
  if (!Array.isArray(enriched?.rankings?.total)) throw new Error("Enriched rankings must contain rankings.total");
  if (enriched.directories?.skills !== undefined && !Array.isArray(enriched.directories.skills)) {
    throw new Error("Enriched directories.skills must be an array");
  }
  const byName = new Map<string, RankingEntry>();
  for (const entry of [...enriched.rankings.total, ...(enriched.directories?.skills ?? [])]) {
    const name = fullName(entry);
    if (byName.has(name)) throw new Error(`Duplicate enriched fullName: ${name}`);
    byName.set(name, entry);
  }
  const market = structuredClone(source);
  const stats: ContentMergeStats = { matched: 0, applied: 0, "skipped-source-change": 0, missing: 0 };
  for (const plugin of market.plugins) {
    const candidate = byName.get(fullName(plugin));
    if (!candidate) { stats.missing++; continue; }
    if (sourceIdentity(plugin) !== sourceIdentity(candidate)) { stats["skipped-source-change"]++; continue; }
    stats.matched++;
    const before = JSON.stringify([plugin.descriptionZh, plugin.tags, plugin.categories]);
    const canonicalDescription = reviewedDescription(plugin);
    if (canonicalDescription) {
      // Current source-bound editorial text outranks a previously frozen result.
      // Its tags are not available here, so do not import tags from that old text.
      plugin.descriptionZh = canonicalDescription;
    } else if (!hasChineseDescription(plugin.descriptionZh)
      && typeof candidate.descriptionZh === "string" && hasChineseDescription(candidate.descriptionZh)) {
      plugin.descriptionZh = candidate.descriptionZh;
      if (Array.isArray(candidate.tags) && candidate.tags.every(tag => typeof tag === "string")) {
        plugin.tags = [...candidate.tags];
      }
    }
    const canonicalCategories = reviewedCategories(plugin);
    const currentManual = currentCategoryAssignments(plugin, plugin.categories)
      .some(category => category.source === "manual");
    if (canonicalCategories !== null) {
      const categories = currentCategoryAssignments(plugin, canonicalCategories)
        .filter(category => category.source === "manual" || category.source === "deepseek");
      // An explicit empty review withdraws a known incorrect prior assignment.
      plugin.categories = categories;
    } else if (!currentManual) {
      const categories = currentCategoryAssignments(plugin, candidate.categories)
        .filter(category => category.source === "manual" || category.source === "deepseek");
      if (hasAuthoritativeCategories(categories)) plugin.categories = categories;
    }
    if (before !== JSON.stringify([plugin.descriptionZh, plugin.tags, plugin.categories])) stats.applied++;
  }
  return { market, stats };
}

function canonicalPath(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(canonicalPath(dirname(path)), basename(path));
}

export async function mergeCatalogContentCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true,
    options: { "dry-run": { type: "boolean", default: false } } });
  if (positionals.length !== 3) throw new Error("Usage: merge-catalog-content.ts SOURCE_MARKET_JSON ENRICHED_RANKINGS_JSON OUTPUT_MARKET_JSON [--dry-run]");
  const sourcePath = realpathSync(resolve(positionals[0]));
  const enrichedPath = realpathSync(resolve(positionals[1]));
  const outputPath = canonicalPath(resolve(positionals[2]));
  if (outputPath === sourcePath || outputPath === enrichedPath) throw new Error("Output must be separate from both input files");
  const source = JSON.parse(readFileSync(sourcePath, "utf8")) as MarketData;
  const enriched = JSON.parse(readFileSync(enrichedPath, "utf8")) as RankingsDocument;
  const { market, stats } = mergeCatalogContent(source, enriched);
  if (!values["dry-run"]) {
    mkdirSync(dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(market, null, 2) + "\n");
      renameSync(temporary, outputPath);
    } finally { rmSync(temporary, { force: true }); }
  }
  console.log(JSON.stringify({ source: sourcePath, enriched: enrichedPath, output: outputPath,
    dryRun: values["dry-run"], ...stats }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  mergeCatalogContentCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : "Catalog content merge failed");
    process.exitCode = 1;
  });
}
