import { refreshBoardSources } from "./board-source-refresh.js";
import { refreshSkillsSources } from "./skills-source-refresh.js";
import { dailyBoardSourceChecksEnabled, dailySkillsSourceChecksEnabled } from "./model-requests.js";
import { loadSourceRecovery } from './source-recovery.js';
import { atomicOperationJson } from './operation-state.js';
import { modelRequestsEnabled, dailySourceChangesOnly, withDailyModelRequest } from "./model-requests.js";
import { bindDailySourceJob } from "./daily-model-scope.js";
import { DEFAULT_MODEL, DEFAULT_MODEL_CONCURRENCY } from "./model-defaults.js";
/** Import collector JSON into SQLite and publish atomic frontend snapshots. */

import "./env.js";

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DshPlugin, MarketData } from "@dsh-top100/schema";
import { fallbackDescriptionZh, buildClassificationRequest } from "./llm.js";
import {
  carryForwardDailyCategories, dailyCategoryWorker, planDailyCategories, runDailyCategories,
  type DailyCategoryState,
} from "./daily-categories.js";
import { publishRankings } from "./publish-rankings.js";
import { buildRankings } from "./rankings.js";
import { completeDailyBoardDescriptions, readDescriptionJobs } from "./daily-board-descriptions.js";
import { attachDescriptionCoverage } from "./board-descriptions.js";
import {
  importMarketData,
  openDatabase,
  readActiveRepositories,
  dateInTimeZone,
} from "./database.js";

import { reviewedDescription } from "./editorial.js";
import { hasChineseDescription } from "./description-jobs.js";
import { refreshInstallAssessments, type AssessmentCache } from "./install-assessment.js";
import { matchingDescriptionHold } from "./content-source.js";
import { descriptionQualityIssue, PENDING_DESCRIPTION_ZH } from "./description-rules.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function logPublicationMemory(phase: string): void {
  const memory = process.memoryUsage();
  console.log(`[publication-memory] ${JSON.stringify({ phase,
    rssMiB: Math.ceil(memory.rss / 1024 ** 2),
    heapMiB: Math.ceil(memory.heapUsed / 1024 ** 2),
    peakMiB: Math.ceil(process.resourceUsage().maxRSS / 1024),
  })}`);
}

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
  const dailyScope = dailySourceChangesOnly();
  if (dailyScope) plan.ready = plan.ready.filter(task => bindDailySourceJob(task.entry, previousSources, previous?.jobs[task.fullName], task.job));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const baseURL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
  const batchSize = Number(process.env.DEEPSEEK_CATEGORY_BATCH_SIZE ?? "200");
  if (!Number.isInteger(batchSize) || batchSize < 0 || batchSize > 2000) {
    throw new Error("DEEPSEEK_CATEGORY_BATCH_SIZE must be an integer from 0 to 2000");
  }
  atomicJson(statePath, plan.state);
  const worker = dailyCategoryWorker({ apiKey: apiKey ?? "", baseURL, model });
  const result = await runDailyCategories(plan, {
    worker: entry => dailyScope ? withDailyModelRequest(buildClassificationRequest({
      name: entry.fullName, type: entry.type, packageName: entry.install?.packageName, repositoryPath: entry.install?.repositoryPath,
      description: entry.description ?? "", readmeSummary: entry.readmeSummary ?? null, topics: entry.topics ?? [],
    }, model), () => worker(entry)) : worker(entry),
    model, limit: modelRequestsEnabled() && apiKey ? batchSize : 0, concurrency: DEFAULT_MODEL_CONCURRENCY,
    onProgress: () => atomicJson(statePath, plan.state),
  });
  atomicJson(statePath, plan.state);
  const count = (status: string) => Object.values(plan.state.jobs).filter(job => job.status === status).length;
  console.log(`Category classification: ${result.completed} DeepSeek, ${result.failed} retry, ${plan.ready.length} ready before this run; `
    + `${count("review-required")} held, ${count("missing-source")} missing source`);
}

async function main(): Promise<void> {
  if (process.env.DSH_OPERATION_DATE && process.env.DSH_OPERATION_DATE !== dateInTimeZone(new Date(), process.env.TZ ?? 'Asia/Shanghai')) {
    throw new Error('daily-operation-crossed-date-boundary');
  }
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
  logPublicationMemory('source-loaded');

  let repairedDescriptions = 0;
  for (const plugin of market.plugins) {
    const reviewed = reviewedDescription(plugin);
    if (reviewed) plugin.descriptionZh = reviewed;
    if (hasChineseDescription(plugin.descriptionZh)) continue;
    // Preserve rejected input until the daily planner records its review hold.
    // Publication rejects it independently, including a non-daily sync.
    if (descriptionQualityIssue(plugin.descriptionZh)) continue;
    plugin.descriptionZh = matchingDescriptionHold(plugin) ? PENDING_DESCRIPTION_ZH : fallbackDescriptionZh({
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
    const rankingNow = new Date();
    const snapshotDate = dateInTimeZone(rankingNow, process.env.TZ ?? "Asia/Shanghai");
    const rankingConfig = resolve(projectRoot, "config/ranking.json");
    const previousSources = new Map(readActiveRepositories(database).map(row => [row.fullName.toLowerCase(), row.raw]));
    const sourceChecksEnabled = dailyBoardSourceChecksEnabled();
    const recoveryPath = join(dirname(sourcePath), 'source-recovery.json');
    const sourceRefresh = await refreshBoardSources(market.plugins,
      () => buildRankings(database, snapshotDate, rankingConfig, { sources: market.plugins, now: rankingNow }),
      { enabled: sourceChecksEnabled, now: rankingNow.getTime(),
        recovery: sourceChecksEnabled ? loadSourceRecovery(recoveryPath) : undefined,
        persistRecovery: state => atomicOperationJson(recoveryPath, state) });
    if (sourceRefresh.length) {
      atomicJson(join(dirname(sourcePath), "board-source-report.json"), { snapshotDate, entries: sourceRefresh,
        reviewCandidates: market.plugins.filter(source => source.install.discovery?.functionReview?.decision === 'held')
          .map(source => ({ fullName: source.fullName, sourceRevision: source.install.discovery!.sourceRevision,
            review: source.install.discovery!.functionReview, action: 'retain-fixed-review-until-material-change-is-approved' })) });
      console.log(`Board source refresh: ${sourceRefresh.length} checked before descriptions`);
    }
    const skillRefresh = await refreshSkillsSources(market.plugins,
      () => buildRankings(database, snapshotDate, rankingConfig, { sources: market.plugins, now: rankingNow }),
      { enabled: dailySkillsSourceChecksEnabled(), now: rankingNow.getTime() });
    if (skillRefresh.length) {
      atomicJson(join(dirname(sourcePath), 'skills-source-report.json'), { snapshotDate, entries: skillRefresh });
      console.log(`Skills source refresh: ${skillRefresh.length} checked before descriptions`);
    }
    logPublicationMemory('sources-reviewed');
    await completeDailyBoardDescriptions(market.plugins, previousSources, dirname(sourcePath),
      () => buildRankings(database, snapshotDate, rankingConfig, { sources: market.plugins, now: rankingNow }), rankingNow.getTime());
    previousSources.clear();
    logPublicationMemory('descriptions-complete');
    await classifyRepositories(market, database, join(dirname(sourcePath), "category-jobs.json"), priority);
    logPublicationMemory('categories-complete');
    atomicJson(sourcePath, market);
    const imported = importMarketData(database, market, {
      model: process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
      timeZone: process.env.TZ ?? "Asia/Shanghai",
      snapshotDate,
    });
    logPublicationMemory('database-imported');
    // Validate imported timestamps against the current time, after recorded_at is written.
    const rankings = buildRankings(
      database,
      imported.snapshotDate,
      rankingConfig,
    );
    const coverage = attachDescriptionCoverage(rankings, readDescriptionJobs(dirname(sourcePath)));
    logPublicationMemory('rankings-built');
    const manifest = publishRankings(rankings, publicDirectory, {
      publicUrlPrefix: process.env.PUBLIC_DATA_URL_PREFIX ?? "/data",
    });
    logPublicationMemory('rankings-published');
    atomicJson(join(dirname(sourcePath), "board-description-report.json"), { snapshotId: manifest.snapshotId, ...coverage });
    console.log(`[board-description-coverage] ${JSON.stringify({ snapshotId: manifest.snapshotId, ...coverage })}`);
    atomicJson(resolve(publicDirectory, "top-stars.json"), {
      schemaVersion: 2,
      generatedAt: rankings.generatedAt,
      requested: rankings.rankings.total.length,
      returned: rankings.rankings.total.length,
      ordering: "stargazers_count desc",
      repositories: rankings.rankings.total,
    });
    atomicJson(resolve(publicDirectory, "plugins.json"), publicPlugins(database, rankings.generatedAt));
    logPublicationMemory('exports-complete');
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
