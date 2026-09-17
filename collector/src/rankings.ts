import { needsFunctionReview } from "./reviewed-evidence-state.js";
/** Ranking computation and stable public JSON models. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { DshPlugin } from "@dsh-top100/schema";
import {
  snapshotReader,
  type SnapshotRow,
  validStarsObservation,
  readActiveRepositoryIds,
  readActiveRepositories,
  type RepositoryRow,
} from "./database.js";
import { CATEGORY_DEFINITIONS } from "./categories.js";
import { fallbackDescriptionZh } from "./llm.js";
import { hasChineseDescription } from "./description-jobs.js";
import { reviewedDescription } from "./editorial.js";
import { matchingDescriptionHold } from "./content-source.js";
import { descriptionQualityIssue } from "./description-rules.js";
import { PENDING_DESCRIPTION_ZH } from "./description-rules.js";
import { isFeaturedRepository } from "../../plugin/src/shared/featured.js";

interface RankingConfig {
  excludedRepositories?: Record<string, { reason: string; reviewedAt: string; sourceUrl: string }>;
  limits: { rising: number; hot: number };
  hot: { weeklyWeight: number; popularityWeight: number; weeklyScale: number; popularityScale: number; minimumStars: number };
  rising: { baselineSmoothing: number; minimumGrowth: number; scoreScale: number };
  windowToleranceHours: number;
  legacySnapshotsThrough?: string;
}

export interface RankingEntry {
  descriptionHistory?: import('@dsh-top100/schema').GeneratedDescriptionVersion[];
  descriptionHistoryHold?: string;
  rank: number;
  totalRank: number;
  fullName: string;
  name: string;
  owner: string;
  description: string;
  descriptionZh: string;
  descriptionPolicy?: 'server-v1';
  descriptionStatus?: { state: 'pending' | 'review-required' | 'missing-source' | 'retry' | 'stale'; reason: string; reviewedAt?: string; origin?: 'model'; generatedAt?: string };
  readmeSummary?: string;
  stars: number;
  dailyStars: number | null;
  weeklyStars: number | null;
  hotScore: number | null;
  threeDayStars?: number | null;
  risingScore?: number | null;
  growthBasis?: { daily?: "observed" | "historical-estimate" | null; threeDay: "observed" | "historical-estimate" | null; weekly: "observed" | "historical-estimate" | null };
  starsObservedAt?: string | null;
  forks: number;
  openIssues: number;
  language: string | null;
  homepage: string | null;
  license: string | null;
  topics: string[];
  tags: string[];
  categories: RepositoryRow["categories"];
  type: string;
  install: RepositoryRow["install"];
  sources: string[];
  url: string;
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RankingsDocument {
  schemaVersion: number;
  generatedAt: string;
  snapshotDate: string;
  definitions: {
    total: string;
    rising: string;
    hot: string;
  };
  categories: Array<{
    id: string;
    label: string;
    description: string;
    count: number;
  }>;
  rankings: {
    total: RankingEntry[];
    rising: RankingEntry[];
    hot: RankingEntry[];
  };
  directories: {
    /** Skills are discoverable, but never participate in Plugin ranking positions or score normalization. */
    skills: RankingEntry[];
  };
}

interface ScoredRepository {
  repository: RepositoryRow;
  totalRank: number;
  dailyStars: number | null;
  weeklyStars: number | null;
  threeDayStars: number | null;
  hotScore: number | null;
  risingScore: number | null;
  risingRawScore: number | null;
  growthBasis?: { daily?: "observed" | "historical-estimate" | null; threeDay: "observed" | "historical-estimate" | null; weekly: "observed" | "historical-estimate" | null };
  starsObservedAt: string | null;
}

function subtractDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function toEntry(scored: ScoredRepository, rank: number): RankingEntry {
  const repository = scored.repository;
  return {
    rank,
    totalRank: scored.totalRank,
    fullName: repository.fullName,
    name: repository.name,
    owner: repository.owner,
    description: repository.description,
    ...(repository.raw.descriptionHistory?.length ? { descriptionHistory: repository.raw.descriptionHistory } : {}),
    ...(repository.raw.descriptionHistoryHold ? { descriptionHistoryHold: repository.raw.descriptionHistoryHold } : {}),
    descriptionZh:
      reviewedDescription(repository) ?? (hasChineseDescription(repository.descriptionZh) ? repository.descriptionZh!
        : descriptionQualityIssue(repository.descriptionZh) || matchingDescriptionHold({ ...repository, id: repository.fullName }) ? PENDING_DESCRIPTION_ZH : fallbackDescriptionZh(repository)),
    ...(repository.readmeSummary ? { readmeSummary: repository.readmeSummary } : {}),
    stars: repository.stars,
    dailyStars: scored.dailyStars,
    weeklyStars: scored.weeklyStars,
    hotScore: scored.hotScore,
    threeDayStars: scored.threeDayStars,
    risingScore: scored.risingScore,
    starsObservedAt: scored.starsObservedAt,
    growthBasis: scored.growthBasis,
    forks: repository.forks,
    openIssues: repository.openIssues,
    language: repository.language,
    homepage: repository.homepage,
    license: repository.license,
    topics: repository.topics,
    tags: repository.tags,
    categories: needsFunctionReview(repository) ? [] : repository.categories,
    type: repository.type,
    install: repository.install,
    sources: repository.sources,
    url: `https://github.com/${repository.fullName}`,
    pushedAt: repository.pushedAt,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
  };
}

/** Repository attention rankings; missing observations never fabricate growth or fill a board. */
export function buildRankings(
  database: DatabaseSync,
  snapshotDate: string,
  configPath = resolve("config/ranking.json"),
  options: { sources?: DshPlugin[]; now?: Date } = {},
): RankingsDocument {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as RankingConfig;
  if (!Number.isFinite(config.rising.scoreScale) || config.rising.scoreScale <= 0)
    throw new Error("ranking.rising.scoreScale must be a positive finite number");
  let activeRepositories: RepositoryRow[];
  if (options.sources) {
    const ids = readActiveRepositoryIds(database);
    // Read today's metadata against existing history without importing it early.
    activeRepositories = options.sources.map((source, index): RepositoryRow => ({
      ...source, id: ids.get(source.fullName.toLowerCase()) ?? -(index + 1),
      categories: source.categories ?? [], raw: source,
    })).sort((a, b) => b.stars - a.stars || (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0));
  } else activeRepositories = readActiveRepositories(database);
  const repositories = activeRepositories.filter((repository) => repository.type === "cordis-plugin"
    && !repository.install?.discovery?.evidence.some(value => value.startsWith('selected-package-ineligible:'))
    && !isFeaturedRepository(repository)
    && !Object.hasOwn(config.excludedRepositories ?? {}, repository.fullName.toLowerCase()));
  const skills = activeRepositories.filter((repository) => repository.type === "skill");
  const now = options.now ?? new Date();
  const readSnapshot = snapshotReader(database, true);
  const cutoff = config.legacySnapshotsThrough;
  const validCutoff = typeof cutoff === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cutoff)
    && Number.isFinite(Date.parse(`${cutoff}T00:00:00Z`));
  const legacyAt = (row: SnapshotRow | null, date: string) => {
    if (!validCutoff || date > cutoff!) return null;
    // Import time can establish a dated snapshot, never a successful API observation.
    if (!row || row.observedAt !== undefined || row.observationInvalid || !Number.isSafeInteger(row.stars) || row.stars < 0
      || !validStarsObservation(row.recordedAt, date, now)) return null;
    return row;
  };
  const score = (repository: RepositoryRow, index: number): ScoredRepository => {
    const observedAt = validStarsObservation(repository.starsObservedAt, snapshotDate, now);
    const growth = (days: number): { delta: number; baseline: number; basis: "observed" | "historical-estimate" } | null => {
      const date = subtractDays(snapshotDate, days);
      const previous = readSnapshot(repository.id, date);
      if (observedAt && previous && validStarsObservation(previous.observedAt, date, now)) {
        const elapsed = Date.parse(observedAt) - Date.parse(previous.observedAt!);
        if (Math.abs(elapsed - days * 86_400_000) > config.windowToleranceHours * 3_600_000) return null;
        return { delta: repository.stars - previous.stars, baseline: previous.stars, basis: "observed" };
      }
      // Exact calendar endpoints only; no nearest-day substitution or zero fill.
      // The fixed cutoff expires each 1/3/7-day fallback independently, without reset on restart.
      if (!validCutoff || date > cutoff!) return null;
      // Explicit stale/invalid observations must not be relabelled as legacy unknown data.
      if (!observedAt && repository.starsObservedAt !== undefined) return null;
      const currentLegacy = !observedAt ? legacyAt(readSnapshot(repository.id, snapshotDate), snapshotDate) : null;
      if (!observedAt && (!currentLegacy || currentLegacy.stars !== repository.stars)) return null;
      if (previous?.observedAt !== undefined) return null; // never reinterpret known observations
      const baseline = legacyAt(previous, date);
      if (!baseline) return null;
      return { delta: repository.stars - baseline.stars, baseline: baseline.stars, basis: "historical-estimate" };
    };
    const daily = growth(1), threeDay = growth(3), weekly = growth(7);
    const weeklyGain = Math.max(0, weekly?.delta ?? 0);
    const risingRawScore = threeDay ? Math.max(0, threeDay.delta) / Math.sqrt(threeDay.baseline + config.rising.baselineSmoothing) : null;
    // Square-root saturation keeps each scale at half credit and approaches the ceiling more slowly.
    const weeklySignal = Math.sqrt(weeklyGain), popularitySignal = Math.sqrt(repository.stars);
    const risingSignal = risingRawScore === null ? null : Math.sqrt(risingRawScore);
    const hot = weekly ? config.hot.weeklyWeight * weeklySignal / (weeklySignal + Math.sqrt(config.hot.weeklyScale))
      + config.hot.popularityWeight * popularitySignal / (popularitySignal + Math.sqrt(config.hot.popularityScale)) : null;
    return {
      repository, totalRank: index + 1, starsObservedAt: repository.starsObservedAt && Number.isFinite(Date.parse(repository.starsObservedAt))
        && Date.parse(repository.starsObservedAt) <= now.getTime() ? repository.starsObservedAt : null,
      // Preserve negative net changes for display; only scoring clips losses.
      dailyStars: daily?.delta ?? null, weeklyStars: weekly?.delta ?? null,
      threeDayStars: threeDay?.delta ?? null,
      growthBasis: { daily: daily?.basis ?? null, threeDay: threeDay?.basis ?? null, weekly: weekly?.basis ?? null },
      hotScore: hot,
      risingRawScore,
      risingScore: risingSignal === null ? null : 100 * risingSignal / (risingSignal + Math.sqrt(config.rising.scoreScale)),
    };
  };
  const scored = repositories.map(score);
  const total = scored.map((item, index) => toEntry(item, index + 1));
  const byName = (a: ScoredRepository, b: ScoredRepository) => a.repository.fullName.localeCompare(b.repository.fullName);
  const rising = scored.filter(item => item.risingScore !== null && item.threeDayStars! >= config.rising.minimumGrowth)
    .sort((a, b) => b.risingRawScore! - a.risingRawScore! || b.threeDayStars! - a.threeDayStars!
      || b.repository.stars - a.repository.stars || byName(a, b))
    .slice(0, config.limits.rising).map((item, index) => toEntry(item, index + 1));
  const hot = scored.filter(item => item.hotScore !== null && item.repository.stars >= config.hot.minimumStars)
    .sort((a, b) => b.hotScore! - a.hotScore! || b.weeklyStars! - a.weeklyStars!
      || b.repository.stars - a.repository.stars || byName(a, b))
    .slice(0, config.limits.hot).map((item, index) => toEntry(item, index + 1));
  const skillDirectory = skills.map(score).map((item, index) => toEntry({ ...item, hotScore: null, risingScore: null }, index + 1));

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    snapshotDate,
    definitions: {
      total: "所属 GitHub 仓库 Stars 总数降序，不代表插件独立使用量",
      rising: `新锐指数（0～100分）=100×√R/(√R+√${config.rising.scoreScale})，R=近3日净增长/√(3日前Stars+${config.rising.baselineSmoothing})；至少净增3星，按未换算原始值排序；历史快照过渡规则见排名方法`,
      hot: "60%平方根平滑近7日增长 + 40%平方根平滑仓库总 Stars；至少10星，数据不足不入榜；历史快照过渡规则见排名方法",
    },
    categories: CATEGORY_DEFINITIONS.map((definition) => ({
      ...definition,
      count: repositories.filter((repository) =>
        repository.categories.some(({ id }) => id === definition.id)
      ).length,
    })),
    rankings: { total, rising, hot },
    directories: { skills: skillDirectory },
  };
}
