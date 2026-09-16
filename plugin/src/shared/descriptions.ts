import { descriptionFor } from "./description-rules.js";
import type { RankingEntry } from "./types.js";

/** Preserve evidence and expose only the server's final summary to search/display. */
export function withPublishedDescription<T extends RankingEntry>(entry: T): T {
  return { ...entry, descriptionZh: descriptionFor(entry) };
}
