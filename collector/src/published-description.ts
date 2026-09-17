import type { RankingEntry, RankingsDocument } from "./rankings.js";
import { reviewedDescription } from "./editorial.js";
import { matchingDescriptionHold } from "./content-source.js";
import { cleanDescription, isUsableChineseDescription, PENDING_DESCRIPTION_ZH } from "./description-rules.js";
import { lastVerifiedDescription } from './description-continuity.js';
import { publicationReviewedDescription } from './publication-description-review.js';
import { generatedHistoryDisplay, generatedSourceUnchanged, hasFixedDescriptionReview } from './generated-description-history.js';

/** Final server decision; empty/withheld results never borrow root metadata. */
export function verifiedDescriptionZh(entry: RankingEntry): string {
  const publicationReview = publicationReviewedDescription(entry);
  if (publicationReview) return publicationReview;
  if (!hasFixedDescriptionReview(entry) && (entry.descriptionHistory?.length || entry.descriptionHistoryHold)) {
    const generated = generatedHistoryDisplay(entry);
    return generated && generatedSourceUnchanged(entry, generated) ? generated.descriptionZh : PENDING_DESCRIPTION_ZH;
  }
  if (entry.descriptionStatus) return PENDING_DESCRIPTION_ZH;
  const reviewed = reviewedDescription(entry);
  if (reviewed !== null) return reviewed;
  // Historical reviews may predate enforceSourceMatch. A publisher must still
  // honor their source/identity holds before marking any cached text as final.
  if (matchingDescriptionHold(entry)) {
    return PENDING_DESCRIPTION_ZH;
  }
  return isUsableChineseDescription(entry.descriptionZh) ? cleanDescription(entry.descriptionZh) : PENDING_DESCRIPTION_ZH;
}

export function publishDescription<T extends RankingEntry>(entry: T): T {
  const descriptionZh = verifiedDescriptionZh(entry);
  if (descriptionZh !== PENDING_DESCRIPTION_ZH) {
    const published = { ...entry, descriptionPolicy: 'server-v1' as const, descriptionZh };
    delete published.descriptionStatus;
    return published;
  }
  const previous = lastVerifiedDescription(entry);
  if (previous) return { ...entry, descriptionPolicy: 'server-v1', descriptionZh: previous.descriptionZh, descriptionStatus: previous.status };
  // A malformed or now-withdrawn stale row cannot carry its old body forward.
  return { ...entry, descriptionPolicy: 'server-v1', descriptionZh,
    ...(entry.descriptionStatus?.state === 'stale' ? { descriptionStatus: {
      state: 'review-required', reason: '上次简介的来源或身份不再满足展示条件，待复核。',
    } } : {}) };
}

export function publishedDescriptionZh(entry: RankingEntry): string {
  return publishDescription(entry).descriptionZh!;
}

/** Normalize before snapshot hashing as well as every legacy compatibility export. */
export function publishDocumentDescriptions(rankings: RankingsDocument): RankingsDocument {
  return { ...rankings,
    rankings: { total: rankings.rankings.total.map(publishDescription),
      hot: rankings.rankings.hot.map(publishDescription), rising: rankings.rankings.rising.map(publishDescription) },
    directories: { ...rankings.directories, skills: (rankings.directories?.skills ?? []).map(publishDescription) },
  };
}
