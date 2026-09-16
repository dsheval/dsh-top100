import type { RankingEntry, RankingsDocument } from "./rankings.js";
import { reviewedDescription } from "./editorial.js";
import { matchingDescriptionHold } from "./content-source.js";
import { cleanDescription, isUsableChineseDescription, PENDING_DESCRIPTION_ZH } from "./description-rules.js";

/** Final server decision; empty/withheld results never borrow root metadata. */
export function publishedDescriptionZh(entry: RankingEntry): string {
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
  return { ...entry, descriptionPolicy: 'server-v1', descriptionZh: publishedDescriptionZh(entry) };
}

/** Normalize before snapshot hashing as well as every legacy compatibility export. */
export function publishDocumentDescriptions(rankings: RankingsDocument): RankingsDocument {
  return { ...rankings,
    rankings: { total: rankings.rankings.total.map(publishDescription),
      hot: rankings.rankings.hot.map(publishDescription), rising: rankings.rankings.rising.map(publishDescription) },
    directories: { ...rankings.directories, skills: (rankings.directories?.skills ?? []).map(publishDescription) },
  };
}
