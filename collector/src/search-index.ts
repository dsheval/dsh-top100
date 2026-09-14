/** Compact all-entry dataset for plugin search, categories, and Agent recommendations. */

import type { RankingSearchEntry } from "@dsh-top100/schema";
import type { RankingsDocument } from "./rankings.js";
import { publishedDescriptionZh } from "./published-description.js";

import { NPM_SPEC_RE, resolveCatalogInstallTarget } from "../../plugin/src/shared/install-source.js";

export function resolveSearchInstallTarget(
  entry: RankingsDocument["rankings"]["total"][number]
): string | null {
  return resolveCatalogInstallTarget(entry);
}

export interface LegacyRankingSearchEntry extends RankingSearchEntry {
  dailyStars: number;
  weeklyStars: number;
  license: string | null;
  pushedAt: string;
  topics: string[];
  install: RankingsDocument["rankings"]["total"][number]["install"];
}

export interface SearchIndexDocument {
  schemaVersion: number;
  generatedAt: string;
  snapshotDate: string;
  definitions: RankingsDocument["definitions"];
  categories: RankingsDocument["categories"];
  rankings: LegacyRankingSearchEntry[];
}

export function toSearchEntry(
  entry: RankingsDocument["rankings"]["total"][number]
): LegacyRankingSearchEntry {
  return {
    rank: entry.rank,
    fullName: entry.fullName,
    name: entry.name,
    description: entry.description,
    ...(publishedDescriptionZh(entry)
      ? { descriptionZh: publishedDescriptionZh(entry) }
      : {}),
    stars: entry.stars,
    dailyStars: entry.dailyStars,
    weeklyStars: entry.weeklyStars,
    license: entry.license,
    pushedAt: entry.pushedAt,
    topics: entry.topics,
    tags: entry.tags,
    categories: entry.categories.map(({ id }) => id),
    type: entry.type,
    install: entry.install,
  };
}

export function toSnapshotSearchEntry(
  entry: RankingsDocument["rankings"]["total"][number]
): RankingSearchEntry {
  const installTarget = resolveSearchInstallTarget(entry);
  return {
    rank: entry.rank,
    fullName: entry.fullName,
    name: entry.name,
    description: entry.description,
    ...(publishedDescriptionZh(entry)
      ? { descriptionZh: publishedDescriptionZh(entry) }
      : {}),
    stars: entry.stars,
    tags: entry.tags,
    categories: entry.categories.map(({ id }) => id),
    type: entry.type,
    ...(entry.install.discovery ? { discovery: entry.install.discovery } : {}),
    ...(entry.install.assessment ? { installAssessment: entry.install.assessment } : {}),
    ...(entry.install.repositoryPath ? { installRepositoryPath: entry.install.repositoryPath } : {}),
    // Source-bound descriptions need package identity even without an install command.
    // Keeping this field does not establish an installTarget or installation eligibility.
    ...(entry.install.packageName ? { installPackageName: entry.install.packageName } : {}),
    ...(installTarget ? {
      installTarget,
      ...(typeof entry.install.needsConfig === "boolean" ? { needsConfig: entry.install.needsConfig } : {}),
    } : {}),
  };
}

export function buildSnapshotSearchEntries(rankings: RankingsDocument): RankingSearchEntry[] {
  return rankings.rankings.total.map(toSnapshotSearchEntry);
}

export function buildSearchIndex(rankings: RankingsDocument): SearchIndexDocument {
  return {
    schemaVersion: rankings.schemaVersion,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    definitions: rankings.definitions,
    categories: rankings.categories,
    rankings: rankings.rankings.total.map(toSearchEntry),
  };
}
