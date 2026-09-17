import reviews from '../config/reviewed-descriptions.json';
import type { RankingEntry } from './rankings.js';
import { matchingEditorialHold } from './content-source.js';
import { cleanDescription, isUsableChineseDescription, matchesReviewedIdentity,
  type ReviewedDescription, type DescriptionStatus } from './description-rules.js';
import { generatedHistoryDisplay } from './generated-description-history.js';

/** Display continuity only. Never used to approve jobs, categories or source hashes. */
export function lastVerifiedDescription(entry: RankingEntry): { descriptionZh: string; status: DescriptionStatus } | null {
  const review = (reviews as Record<string, ReviewedDescription>)[entry.fullName.toLowerCase()];
  if (!review) {
    const generated = generatedHistoryDisplay(entry);
    return generated ? { descriptionZh: generated.descriptionZh, status: { state: 'stale', origin: 'model',
      generatedAt: new Date(generated.generatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
      reason: '当前来源尚未确认，暂保留有来源记录的旧模型简介，等待核查。' } } : null;
  }
  // Unbound legacy records and Skills cannot establish a previous plugin identity.
  if (entry.type !== 'cordis-plugin' || !review || review.sourceType !== entry.type
    || !review.sourceInstall?.packageName || review.suspended || review.reviewRequiredReason
    || !matchesReviewedIdentity(entry, review.sourceInstall, review.sourceType)
    || matchingEditorialHold(entry)) return null;
  const date = review.reviewedAt;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) return null;
  const descriptionZh = cleanDescription(review.descriptionZh);
  if (!isUsableChineseDescription(descriptionZh)) return null;
  return { descriptionZh, status: { state: 'stale', reviewedAt: date,
    reason: '当前来源尚未完成核验，暂保留上次已核实的简介，待更新。' } };
}
