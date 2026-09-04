import reviewed from "./reviewed-descriptions.json" with { type: "json" };
import { descriptionFor, type DescriptionContext } from "./description-rules.js";
import type { RankingEntry } from "./types.js";

/** Keep evidence intact; only replace the presentation/search field. */
export function withReviewedDescription<T extends RankingEntry>(entry: T, context: DescriptionContext = {}): T {
  return { ...entry, descriptionZh: descriptionFor(entry, reviewed, context) };
}
