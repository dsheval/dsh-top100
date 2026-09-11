import { modelRequestsEnabled } from "./model-requests.js";
import { DEFAULT_MODEL, DEFAULT_MODEL_CONCURRENCY } from "./model-defaults.js";
/** Import collector JSON into SQLite and publish atomic frontend snapshots. */

import "./env.js";

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DshPlugin, MarketData } from "@dsh-top100/schema";
import { fallbackDescriptionZh } from "./llm.js";
import {
  carryForwardDailyCategories, dailyCategoryWorker, planDailyCategories, runDailyCategories,
  type DailyCategoryState,
} from "./daily-categories.js";
import { publishRankings } from "./publish-rankings.js";
import { buildRankings } from "./rankings.js";
import {
  importMarketData,
  openDatabase,
  readActiveRepositories,
} from "./database.js";

import { reviewedDescription } from "./editorial.js";
import { hasChineseDescription } from "./description-jobs.js";
import { refreshInstallAssessments, type AssessmentCache } from "./install-assessment.js";
import { matchingEditorialHold } from "./content-source.js";
import { PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function atomicJson(path: string, value: unknown, compact = false): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, compact ? 0 : 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function publicPlugins(database: ReturnType<typeof openDatabase>, generatedAt: string): MarketData {
  const plugins = readActiveRepositories(database).map((repository) => ({
    ...repository.raw,
    fullName: repository.fullName,
    name: repository.name,
    owner: repository.owner,
    stars: repository.stars,
    forks: repository.forks,
    openIssues: repository.openIssues,
    description: repository.description,
    descriptionZh: repository.descriptionZh,
    categories: repository.categories,
    pushedAt: repository.pushedAt,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
  })) as DshPlugin[];
  return { schemaVersion: 2, generatedAt, plugins, packs: [] };
}

async function classifyRepositories(
  market: MarketData,
  database: ReturnType<typeof openDatabase>,
  statePath: string,
  priority: ReadonlySet<string>,
): Promise<void> {
  let previous: DailyCategoryState | undefined;
  try {
    previous = JSON.parse(readFileSync(statePath, "utf8")) as DailyCategoryState;
    if (previous.schemaVersion !== 1 || !previous.jobs || typeof previous.jobs !== "object" || Array.isArray(previous.jobs)) {
      throw new Error("Invalid daily category job state");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Legacy SQLite category-cache hashes omit identity fields. The full old row
  // supplies the evidence needed to migrate unchanged sources without rebinding.
  const previousSources = new Map(readActiveRepositories(database).map(repository => [
    repository.fullName.toLowerCase(), { ...repository.raw, categories: repository.categories },
  ]));
  carryForwardDailyCategories(market.plugins, previousSources);
  const plan = planDailyCategories(market.plugins, { previous, priority });
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const baseURL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
  const batchSize = Number(process.env.DEEPSEEK_CATEGORY_BATCH_SIZE ?? "200");
  if (!Number.isInteger(batchSize) || batchSize < 0 || batchSize > 2000) {
    throw new Error("DEEPSEEK_CATEGORY_BATCH_SIZE must be an integer from 0 to 2000");
  }
  atomicJson(statePath, plan.state);
  const result = await runDailyCategories(plan, {
    worker: dailyCategoryWorker({ apiKey: apiKey ?? "", baseURL, model }),
    model, limit: modelRequestsEnabled() && apiKey ? batchSize : 0, concurrency: DEFAULT_MODEL_CONCURRENCY,
    onProgress: () => atomicJson(statePath, plan.state),
  });
  atomicJson(statePath, plan.state);
  const count = (status: string) => Object.values(plan.state.jobs).filter(job => job.status === status).length;
  console.log(`Category classification: ${result.completed} DeepSeek, ${result.failed} retry, ${plan.ready.length} ready before this run; `
    + `${count("review-required")} held, ${count("missing-source")} missing source`);
}

async function main(): Promise<void> {
  const sourcePath = resolve(projectRoot, process.env.SOURCE_DATA_PATH ?? "data/plugins.json");
  const databasePath = resolve(
    projectRoot,
    process.env.DATABASE_PATH ?? "runtime/dsh-top100.sqlite"
  );
  const publicDirectory = resolve(
    projectRoot,
    process.env.PUBLIC_DATA_DIR ?? "runtime/public-data"
  );
  const market = JSON.parse(readFileSync(sourcePath, "utf8")) as MarketData;
  if (!Array.isArray(market.plugins) || market.plugins.length === 0) {
    throw new Error(`Source snapshot has no plugins: ${sourcePath}`);
  }

  let repairedDescriptions = 0;
  for (const plugin of market.plugins) {
    const reviewed = reviewedDescription(plugin);
    if (reviewed) plugin.descriptionZh = reviewed;
    if (hasChineseDescription(plugin.descriptionZh)) continue;
    plugin.descriptionZh = matchingEditorialHold(plugin) ? PENDING_DESCRIPTION_ZH : fallbackDescriptionZh({
      name: plugin.name,
      repositoryPath: plugin.install?.repositoryPath,
      description: plugin.description,
      readmeSummary: plugin.readmeSummary,
      topics: plugin.topics,
    });
    repairedDescriptions++;
  }
  if (repairedDescriptions > 0) {
    console.log(`Description fallback repair: ${repairedDescriptions} repositories`);
  }

  const assessmentPath = join(dirname(sourcePath), "install-assessments.json");
  let assessmentCache: AssessmentCache = {};
  try { assessmentCache = JSON.parse(readFileSync(assessmentPath, "utf8")); } catch { /* first check */ }
  const assessmentLimit = Number(process.env.INSTALL_ASSESSMENT_BATCH_SIZE ?? "100");
  if (!Number.isInteger(assessmentLimit) || assessmentLimit < 0 || assessmentLimit > 2000) throw new Error("INSTALL_ASSESSMENT_BATCH_SIZE must be an integer from 0 to 2000");
  const priority = new Set<string>();
  try {
    const previous = JSON.parse(readFileSync(join(publicDirectory, "rankings.json"), "utf8"));
    for (const list of [previous.rankings?.hot, previous.rankings?.rising, previous.rankings?.total?.slice(0, 100)]) {
      for (const entry of list ?? []) priority.add(String(entry.fullName).toLowerCase());
    }
  } catch { /* first publication prioritizes Stars */ }
  const assessmentResult = await refreshInstallAssessments(market.plugins, assessmentCache, { limit: assessmentLimit, priority });
  atomicJson(assessmentPath, assessmentResult.cache);
  console.log(`Source metadata preflight: ${assessmentResult.checked} checked (no package execution)`);

  const database = openDatabase({ path: databasePath });
  try {
    await classifyRepositories(market, database, join(dirname(sourcePath), "category-jobs.json"), priority);
    atomicJson(sourcePath, market);
    const imported = importMarketData(database, market, {
      model: process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
      timeZone: process.env.TZ ?? "Asia/Shanghai",
    });
    const rankings = buildRankings(
      database,
      imported.snapshotDate,
      resolve(projectRoot, "config/ranking.json")
    );
    const plugins = publicPlugins(database, rankings.generatedAt);

    const manifest = publishRankings(rankings, publicDirectory, {
      publicUrlPrefix: process.env.PUBLIC_DATA_URL_PREFIX ?? "/data",
    });
    atomicJson(resolve(publicDirectory, "top-stars.json"), {
      schemaVersion: 2,
      generatedAt: rankings.generatedAt,
      requested: rankings.rankings.total.length,
      returned: rankings.rankings.total.length,
      ordering: "stargazers_count desc",
      repositories: rankings.rankings.total,
    });
    atomicJson(resolve(publicDirectory, "plugins.json"), plugins);
    console.log(
      `SQLite import complete: ${imported.repositories} repositories, snapshot ${imported.snapshotDate}`
    );
    console.log(
      `Published ranking snapshot ${manifest.snapshotId} (${manifest.datasets.total.pageCount} total pages) to ${publicDirectory}`
    );
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
