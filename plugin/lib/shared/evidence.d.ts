/** Conservative, explainable catalog classification. It never claims a security review. */
import type { CatalogEvidence, CatalogFormFactor, RankingEntry } from "./types.js";
export declare function classifyFormFactor(entry: RankingEntry, profile?: string): CatalogFormFactor;
export declare function catalogEvidence(entry: RankingEntry, profile?: string): CatalogEvidence;
