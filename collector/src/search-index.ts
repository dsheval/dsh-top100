/** Compact all-entry dataset for plugin search, categories, and Agent recommendations. */

import type { RankingSearchEntry } from "@dsh-top100/schema";
import type { RankingsDocument } from "./rankings.js";

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
    ...(entry.descriptionZh && entry.descriptionZh !== entry.description
      ? { descriptionZh: entry.descriptionZh }
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
    ...(entry.descriptionZh && entry.descriptionZh !== entry.description
      ? { descriptionZh: entry.descriptionZh }
      : {}),
    stars: entry.stars,
    tags: entry.tags,
    categories: entry.categories.map(({ id }) => id),
    type: entry.type,
    ...(installTarget ? {
      installTarget,
      ...(typeof entry.install.needsConfig === "boolean" ? { needsConfig: entry.install.needsConfig } : {}),
      // Compact consumers must retain the selected package identity. A legacy
      // installTarget alone only proves syntax, not which project it installs.
      ...(NPM_SPEC_RE.test(installTarget) ? { installPackageName: entry.install.packageName } : {}),
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
