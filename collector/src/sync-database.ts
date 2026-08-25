/** Import collector JSON into SQLite and publish atomic frontend snapshots. */

import "./env.js";

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DshPlugin, MarketData } from "@dsh-top100/schema";
import {
  fallbackCategoryAssignments,
  hasAuthoritativeCategories,
  normalizeCategoryAssignments,
  toDeepSeekAssignments,
} from "./categories.js";
import {
  classifyWithDeepSeek,
  fallbackDescriptionZh,
  isGenericDescriptionZh,
} from "./llm.js";
import { runPool } from "./pool.js";
import { buildRankings } from "./rankings.js";
import {
  categorySourceHash,
  importMarketData,
  openDatabase,
  readActiveRepositories,
  readCategoryCache,
} from "./database.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  database: ReturnType<typeof openDatabase>
): Promise<void> {
  const cache = readCategoryCache(database);
  for (const plugin of market.plugins) {
    plugin.categories = normalizeCategoryAssignments(plugin.categories);
    if (hasAuthoritativeCategories(plugin.categories)) continue;
    const cached = cache.get(plugin.fullName.toLocaleLowerCase());
    const cachedCategories = normalizeCategoryAssignments(cached?.categories);
    if (
      cached &&
      cached.sourceHash === categorySourceHash(plugin) &&
      hasAuthoritativeCategories(cachedCategories)
    ) {
      plugin.categories = cachedCategories;
    }
  }

  const pending = market.plugins.filter(
    (plugin) => !hasAuthoritativeCategories(plugin.categories)
  );
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  const baseURL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
  const batchSize = Number(process.env.DEEPSEEK_CATEGORY_BATCH_SIZE ?? "200");
  if (!Number.isInteger(batchSize) || batchSize < 0 || batchSize > 2000) {
    throw new Error("DEEPSEEK_CATEGORY_BATCH_SIZE must be an integer from 0 to 2000");
  }

  let classified = 0;
  if (apiKey && batchSize > 0) {
    const batch = pending.slice(0, batchSize);
    await runPool(
      batch,
      async (plugin) => {
        const suggestions = await classifyWithDeepSeek(
          {
            name: plugin.fullName,
            description: plugin.description,
            readmeSummary: plugin.readmeSummary,
            topics: plugin.topics,
          },
          { apiKey, baseURL, model }
        );
        if (suggestions.length > 0) {
          plugin.categories = toDeepSeekAssignments(suggestions, model);
          classified++;
        }
      },
      5
    );
  }

  let fallback = 0;
  for (const plugin of market.plugins) {
    if (hasAuthoritativeCategories(plugin.categories)) continue;
    plugin.categories = fallbackCategoryAssignments(plugin);
    fallback++;
  }
  console.log(
    `Category classification: ${classified} DeepSeek, ${fallback} rule fallback, ${pending.length} pending before this run`
  );
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
    if (plugin.descriptionZh && !isGenericDescriptionZh(plugin.descriptionZh)) continue;
    plugin.descriptionZh = fallbackDescriptionZh({
      name: plugin.name,
      description: plugin.description,
      readmeSummary: plugin.readmeSummary,
      topics: plugin.topics,
    });
    repairedDescriptions++;
  }
  if (repairedDescriptions > 0) {
    console.log(`Description fallback repair: ${repairedDescriptions} repositories`);
  }

  const database = openDatabase({ path: databasePath });
  try {
    await classifyRepositories(market, database);
    atomicJson(sourcePath, market);
    const imported = importMarketData(database, market, {
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      timeZone: process.env.TZ ?? "Asia/Shanghai",
    });
    const rankings = buildRankings(
      database,
      imported.snapshotDate,
      resolve(projectRoot, "config/ranking.json")
    );
    const plugins = publicPlugins(database, rankings.generatedAt);

    atomicJson(resolve(publicDirectory, "rankings.json"), rankings);
    atomicJson(resolve(publicDirectory, "rankings-total.json"), {
      ...rankings,
      rankings: rankings.rankings.total,
    });
    atomicJson(resolve(publicDirectory, "rankings-rising.json"), {
      ...rankings,
      rankings: rankings.rankings.rising,
    });
    atomicJson(resolve(publicDirectory, "rankings-daily.json"), {
      ...rankings,
      rankings: rankings.rankings.rising,
    });
    atomicJson(resolve(publicDirectory, "rankings-hot.json"), {
      ...rankings,
      rankings: rankings.rankings.hot,
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
    console.log(`Published ranking snapshots to ${publicDirectory}`);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
