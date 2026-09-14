import type { RankingEntry } from "./rankings.js";
import { reviewedDescription } from "./editorial.js";
import { matchingEditorialHold } from "./content-source.js";
import { PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";

/** Keep explicit Chinese even when it equals the author description. A subpackage
 * consumer cannot safely reconstruct that field from the root description. */
export function publishedDescriptionZh(entry: RankingEntry): string | undefined {
  return reviewedDescription(entry)
    ?? (entry.install?.repositoryPath && entry.descriptionZh === entry.description && matchingEditorialHold(entry)
      ? PENDING_DESCRIPTION_ZH : entry.descriptionZh || undefined);
}
