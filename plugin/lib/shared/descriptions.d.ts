import type { RankingEntry } from "./types.js";
/** Preserve evidence and expose only the server's final summary to search/display. */
export declare function withPublishedDescription<T extends RankingEntry>(entry: T): T;
