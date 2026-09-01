/** Compact all-entry dataset for plugin search, categories, and Agent recommendations. */

import type { RankingSearchEntry } from "@dsh-top100/schema";
import type { RankingsDocument } from "./rankings.js";

const NPM_NAME = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
const NPM_SELECTOR = "[a-z0-9][a-z0-9._+-]*";
const NPM_SPEC_RE = new RegExp(`^${NPM_NAME}(?:@${NPM_SELECTOR})?$`, "i");
const GITHUB_REPOSITORY = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}";
const GITHUB_SPEC_RE = new RegExp(
  `^github:${GITHUB_REPOSITORY}(?:#[A-Za-z0-9._~+/:=-]+)?$`,
  "i"
);
const FULL_NAME_RE = new RegExp(`^${GITHUB_REPOSITORY}$`);
const UNSAFE_TOKEN_RE = /[\s|&;<>()$`\\'"!*?]/;
const DSH_ADD_RE = /\bdsh\s+plugin\b(?:\s+--profile\s+\S+)?\s+add\s+(.+)$/i;

function parseInstallTarget(value: unknown): string | null {
  const token = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!token || token.startsWith("-") || UNSAFE_TOKEN_RE.test(token)) return null;
  if (token.startsWith("link:") || token.startsWith("file:") || token.startsWith("http")) {
    return null;
  }
  return GITHUB_SPEC_RE.test(token) || NPM_SPEC_RE.test(token) ? token : null;
}

function targetMatchesRepository(target: string, fullName: string): boolean {
  if (!target.toLowerCase().startsWith("github:")) return true;
  const repository = target.slice("github:".length).split("#", 1)[0];
  return repository.toLowerCase() === fullName.toLowerCase();
}

export function resolveSearchInstallTarget(
  entry: RankingsDocument["rankings"]["total"][number]
): string | null {
  for (const command of entry.install.commands ?? []) {
    const match = command.match(DSH_ADD_RE);
    if (!match) continue;
    const remainder = match[1].trim();
    if (remainder.split(/\s+/).length !== 1) continue;
    const target = parseInstallTarget(remainder);
    if (target && targetMatchesRepository(target, entry.fullName)) return target;
  }

  if (entry.type.toLowerCase() === "skill" && FULL_NAME_RE.test(entry.fullName)) {
    return `github:${entry.fullName}`;
  }
  return null;
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
    ...(installTarget ? { installTarget } : {}),
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
