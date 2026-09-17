import { createHash } from 'node:crypto';
import reviews from '../config/reviewed-descriptions.json';
import type { RankingEntry } from './rankings.js';
import { hasInvalidSelectedPackage, isUsableChineseDescription, type ReviewedDescription } from './description-rules.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, canonical(field)]));
  return value;
}

/** A publication-only approval binds the complete observed evidence, not a reusable function marker. */
export function publicationDescriptionSourceHash(entry: Pick<RankingEntry, 'fullName' | 'type' | 'install' | 'description' | 'readmeSummary'>): string {
  // Reading the same evidence tomorrow must not revoke a wording review.
  const { checkedAt: _checkedAt, ...evidence } = entry.install.discovery ?? {};
  return createHash('sha256').update(JSON.stringify(canonical([
    'publication-description-v1', entry.fullName.toLowerCase(), entry.type,
    entry.description ?? '', entry.readmeSummary ?? '', entry.install.packageName ?? null,
    entry.install.repositoryPath ?? null, entry.install.discovery ? evidence : null,
  ]))).digest('hex');
}

/** Never consumed by collection, cache completion, paid eligibility or categories. */
export function publicationReviewedDescription(entry: RankingEntry): string | null {
  const review = (reviews as Record<string, ReviewedDescription>)[entry.fullName.toLowerCase()];
  const approved = review?.publicationReview;
  if (!approved || review.suspended || review.reviewRequiredReason || hasInvalidSelectedPackage(entry)
    || entry.type !== 'cordis-plugin' || !entry.install.discovery || !isUsableChineseDescription(approved.descriptionZh)
    || approved.sourceHash !== publicationDescriptionSourceHash(entry)) return null;
  return approved.descriptionZh;
}
