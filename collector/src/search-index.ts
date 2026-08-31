/** Compact all-entry dataset for plugin search, categories, and Agent recommendations. */

import type { RankingsDocument } from "./rankings.js";

export function buildSearchIndex(rankings: RankingsDocument) {
  return {
    schemaVersion: rankings.schemaVersion,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    definitions: rankings.definitions,
    categories: rankings.categories,
    rankings: rankings.rankings.total.map((entry) => ({
      rank: entry.rank,
      fullName: entry.fullName,
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
    })),
  };
}
