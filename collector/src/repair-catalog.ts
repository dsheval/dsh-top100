/** Repair a frozen rankings snapshot locally, preserving every rank and growth metric.
 * Usage: node --use-env-proxy --import tsx collector/src/repair-catalog.ts INPUT OUTPUT_DIR [--verify-sources]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { CATEGORY_DEFINITIONS, fallbackCategoryAssignments, currentCategoryAssignments, hasAuthoritativeCategories } from "./categories.js";
import { reviewedCategories, reviewedDescription } from "./editorial.js";
import { hasChineseDescription, planDescriptionJobs } from "./description-jobs.js";
import { fallbackDescriptionZh } from "./llm.js";
import { refreshInstallAssessments, type AssessmentCache } from "./install-assessment.js";
import { publishRankings } from "./publish-rankings.js";
import type { RankingsDocument } from "./rankings.js";

const [input, output, verify] = process.argv.slice(2);
if (!input || !output || (verify && verify !== "--verify-sources")) throw new Error("Usage: repair-catalog.ts INPUT OUTPUT_DIR [--verify-sources]");
const outputDirectory = resolve(output);
if (resolve(input) === join(outputDirectory, "rankings.json")) throw new Error("Keep the original snapshot separate from repaired output");
mkdirSync(outputDirectory, { recursive: true });
const document = JSON.parse(readFileSync(input, "utf8")) as RankingsDocument;
if (!Array.isArray(document.rankings?.total) || !document.rankings.total.length) throw new Error("Input must be a nonempty rankings snapshot");
const priority = new Set([...document.rankings.total.slice(0, 100), ...document.rankings.hot, ...document.rankings.rising].map(entry => entry.fullName.toLowerCase()));
const entries = [...document.rankings.total, ...document.directories?.skills ?? []];
const changes: unknown[] = [];
for (const entry of entries) {
  const before = { descriptionZh: entry.descriptionZh, categories: entry.categories.map(category => category.id) };
  entry.descriptionZh = reviewedDescription(entry) ?? (hasChineseDescription(entry.descriptionZh) ? entry.descriptionZh : fallbackDescriptionZh({ ...entry, readmeSummary: entry.readmeSummary ?? null }));
  const existing = currentCategoryAssignments(entry, entry.categories);
  entry.categories = reviewedCategories(entry) ?? (hasAuthoritativeCategories(existing) ? existing : fallbackCategoryAssignments(entry));
  const after = { descriptionZh: entry.descriptionZh, categories: entry.categories.map(category => category.id) };
  if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ fullName: entry.fullName, priority: priority.has(entry.fullName.toLowerCase()), before, after });
}
const cachePath = join(outputDirectory, "install-assessments.json");
let cache: AssessmentCache = {};
try { cache = JSON.parse(readFileSync(cachePath, "utf8")); } catch { /* new audit */ }
// This operator command verifies only the explicitly selected priority cohort.
const assessments = await refreshInstallAssessments(entries.filter(entry => priority.has(entry.fullName.toLowerCase())), cache, { limit: verify ? priority.size : 0, priority });
writeFileSync(cachePath, JSON.stringify(assessments.cache, null, 2) + "\n");
const byName = new Map(entries.map(entry => [entry.fullName, entry]));
for (const key of ["hot", "rising"] as const) {
  document.rankings[key] = document.rankings[key].map(entry => ({ ...byName.get(entry.fullName)!, rank: entry.rank }));
}
document.categories = CATEGORY_DEFINITIONS.map(definition => ({ ...definition,
  count: entries.filter(entry => entry.categories.some(category => category.id === definition.id)).length }));
const sources = entries.map(entry => ({ ...entry, id: entry.fullName.toLowerCase(), readmeSummary: entry.readmeSummary ?? null }));
const { jobs } = planDescriptionJobs(sources, {}, priority, Date.now());
const report = { input: resolve(input), sourceGeneratedAt: document.generatedAt, repairedAt: new Date().toISOString(),
  entries: entries.length, priorityEntries: priority.size, checkedSources: assessments.checked,
  priorityMissingChinese: entries.filter(entry => priority.has(entry.fullName.toLowerCase()) && !hasChineseDescription(entry.descriptionZh)).map(entry => entry.fullName),
  pendingDescriptions: entries.filter(entry => !hasChineseDescription(entry.descriptionZh)).length,
  pendingCategories: entries.filter(entry => !hasAuthoritativeCategories(entry.categories)).length,
  changes };
writeFileSync(join(outputDirectory, "repair-report.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(outputDirectory, "description-jobs.json"), JSON.stringify({ jobs }) + "\n");
const manifest = publishRankings(document, outputDirectory);
console.log(JSON.stringify({ snapshotId: manifest.snapshotId, entries: report.entries, priority: report.priorityEntries, priorityMissingChinese: report.priorityMissingChinese.length, pendingDescriptions: report.pendingDescriptions, checkedSources: assessments.checked }));
