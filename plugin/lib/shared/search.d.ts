/** Lightweight weighted search shared by the DSH plugin host. */
import type { RankingEntry } from "./types.js";
export declare function normalizeSearchText(value: unknown): string;
export declare function tokenizeSearchQuery(value: unknown): string[];
/** Compile the query once per list, then reuse normalized entry fields across searches. */
export declare function createSearchScorer(query: string): (entry: RankingEntry) => number | null;
export declare function scoreSearchEntry(entry: RankingEntry, query: string): number | null;
export declare function matchesSearchQuery(entry: RankingEntry, query: string): boolean;
