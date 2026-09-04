import { type DescriptionContext } from "./description-rules.js";
import type { RankingEntry } from "./types.js";
/** Keep evidence intact; only replace the presentation/search field. */
export declare function withReviewedDescription<T extends RankingEntry>(entry: T, context?: DescriptionContext): T;
