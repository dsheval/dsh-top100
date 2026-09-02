import type { RankingEntry } from "../shared/types.js";

/** Keep the rank from the active view while enriching the item with authoritative detail fields. */
export function mergeDetailPreservingViewRank<T extends RankingEntry>(current: T, detail: RankingEntry): T {
  return { ...current, ...detail, rank: current.rank };
}
