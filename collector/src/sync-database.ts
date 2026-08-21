/** Import collector JSON into SQLite and publish atomic frontend snapshots. */

import "./env.js";

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DshPlugin, MarketData } from "@dsh-top100/schema";
import { buildRankings } from "./rankings.js";
import { importMarketData, openDatabase, readActiveRepositories } from "./database.js";

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
    pushedAt: repository.pushedAt,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
  })) as DshPlugin[];
  return { schemaVersion: 2, generatedAt, plugins, packs: [] };
}

function main(): void {
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

  const database = openDatabase({ path: databasePath });
  try {
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

main();
