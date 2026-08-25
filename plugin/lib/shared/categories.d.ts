/** Category contract mirrored from the www.dsheval.ai rankings document. */
import type { PluginCategoryDefinition, PluginCategoryId, RankingEntry, RankingsDocument } from "./types.js";
export declare const DEFAULT_CATEGORY_DEFINITIONS: readonly Omit<PluginCategoryDefinition, "count">[];
export declare function isPluginCategoryId(value: string | null): value is PluginCategoryId;
export declare function entryMatchesCategory(entry: RankingEntry, category: PluginCategoryId): boolean;
export declare function catalogCategories(document: RankingsDocument): PluginCategoryDefinition[];
