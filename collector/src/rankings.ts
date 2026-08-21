/** Ranking computation and stable public JSON models. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  previousSnapshot,
  readActiveRepositories,
  type RepositoryRow,
} from "./database.js";

interface RankingConfig {
  limits: { rising: number; hot: number };
  hotWeights: {
    dailyGrowth: number;
    weeklyGrowth: number;
    growthRate: number;
    activity: number;
    quality: number;
    popularity: number;
  };
  activityHalfLifeDays: number;
  growthRateAtFullScore: number;
}

export interface RankingEntry {
  rank: number;
  totalRank: number;
  fullName: string;
  name: string;
  owner: string;
  description: string;
  descriptionZh: string;
  stars: number;
  dailyStars: number;
  weeklyStars: number;
  hotScore: number;
  forks: number;
  openIssues: number;
  language: string | null;
  homepage: string | null;
  license: string | null;
  topics: string[];
  tags: string[];
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
  rankings: {
    total: RankingEntry[];
    rising: RankingEntry[];
    hot: RankingEntry[];
  };
}

interface ScoredRepository {
  repository: RepositoryRow;
  totalRank: number;
  dailyStars: number;
  weeklyStars: number;
  previousWeekStars: number;
  hotScore: number;
}

function subtractDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function ageInDays(isoDate: string, now: Date): number {
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp)
    ? Math.max(0, (now.getTime() - timestamp) / 86_400_000)
    : Number.POSITIVE_INFINITY;
}

function normalizeLog(value: number, maximum: number): number {
  if (value <= 0 || maximum <= 0) return 0;
  return Math.log1p(value) / Math.log1p(maximum);
}

function qualityScore(repository: RepositoryRow): number {
  const signals = [
    Boolean(repository.descriptionZh),
    Boolean(repository.readmeSummary),
    Boolean(repository.license),
    repository.sources.length > 0,
  ];
  return signals.filter(Boolean).length / signals.length;
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
    descriptionZh:
      repository.descriptionZh || repository.description || "暂无中文简介，请查看项目 README。",
    stars: repository.stars,
    dailyStars: scored.dailyStars,
    weeklyStars: scored.weeklyStars,
    hotScore: scored.hotScore,
    forks: repository.forks,
    openIssues: repository.openIssues,
    language: repository.language,
    homepage: repository.homepage,
    license: repository.license,
    topics: repository.topics,
    tags: repository.tags,
    type: repository.type,
    install: repository.install,
    sources: repository.sources,
    url: `https://github.com/${repository.fullName}`,
    pushedAt: repository.pushedAt,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
  };
}

/** Build the complete total ranking, weekly rising 100, and configurable Hot 100. */
export function buildRankings(
  database: DatabaseSync,
  snapshotDate: string,
  configPath = resolve("config/ranking.json")
): RankingsDocument {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as RankingConfig;
  const repositories = readActiveRepositories(database);
  const weekDate = subtractDays(snapshotDate, 7);
  const now = new Date();

  const scored: ScoredRepository[] = repositories.map((repository, index) => {
    const yesterday = previousSnapshot(database, repository.id, snapshotDate, false);
    const lastWeek = previousSnapshot(database, repository.id, weekDate, true);
    return {
      repository,
      totalRank: index + 1,
      dailyStars: yesterday ? Math.max(0, repository.stars - yesterday.stars) : 0,
      weeklyStars: lastWeek ? Math.max(0, repository.stars - lastWeek.stars) : 0,
      previousWeekStars: lastWeek?.stars ?? repository.stars,
      hotScore: 0,
    };
  });

  const maxDaily = Math.max(0, ...scored.map((item) => item.dailyStars));
  const maxWeekly = Math.max(0, ...scored.map((item) => item.weeklyStars));
  const maxStars = Math.max(0, ...scored.map((item) => item.repository.stars));
  const weights = config.hotWeights;

  for (const item of scored) {
    const weeklyRate = item.weeklyStars / Math.max(item.previousWeekStars, 1);
    const activity = Math.pow(
      0.5,
      ageInDays(item.repository.pushedAt, now) / config.activityHalfLifeDays
    );
    const score =
      normalizeLog(item.dailyStars, maxDaily) * weights.dailyGrowth +
      normalizeLog(item.weeklyStars, maxWeekly) * weights.weeklyGrowth +
      Math.min(weeklyRate / config.growthRateAtFullScore, 1) * weights.growthRate +
      activity * weights.activity +
      qualityScore(item.repository) * weights.quality +
      normalizeLog(item.repository.stars, maxStars) * weights.popularity;
    item.hotScore = Math.round(score * 100) / 100;
  }

  const total = scored.map((item, index) => toEntry(item, index + 1));
  const rising = [...scored]
    .sort(
      (left, right) =>
        right.weeklyStars - left.weeklyStars ||
        right.repository.stars - left.repository.stars ||
        left.repository.fullName.localeCompare(right.repository.fullName)
    )
    .slice(0, config.limits.rising)
    .map((item, index) => toEntry(item, index + 1));
  const hot = [...scored]
    .sort(
      (left, right) =>
        right.hotScore - left.hotScore ||
        right.dailyStars - left.dailyStars ||
        right.repository.stars - left.repository.stars ||
        left.repository.fullName.localeCompare(right.repository.fullName)
    )
    .slice(0, config.limits.hot)
    .map((item, index) => toEntry(item, index + 1));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    snapshotDate,
    definitions: {
      total: "当前 GitHub Stars 总数降序",
      rising: "当前 Stars 减去七日前最近一个历史快照的 Stars",
      hot: "日增、周增、增长率、活跃度、数据质量与总热度的加权分",
    },
    rankings: { total, rising, hot },
  };
}
