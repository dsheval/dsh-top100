/** Model-facing Top100 recommendation Skill and its read-only catalog search tool. */
import type { Context } from "@deepseek-ai/cordis";
import type { PluginCategoryId, RankingsDocument } from "../shared/types.js";
import type { PluginResolvedConfig } from "./contracts.js";
export declare const RECOMMENDATION_SKILL_NAME = "recommend-dsh-plugins";
export declare const RECOMMENDATION_TOOL_NAME = "dsh_top100_search";
export declare const DSHEVAL_CATALOG_URL = "https://www.dsheval.ai/#ranking";
export interface RecommendationItem {
    rank: number;
    fullName: string;
    name: string;
    type: string;
    description: string;
    stars: number;
    dailyStars: number;
    weeklyStars: number;
    categories: string[];
    installable: boolean;
    installed: boolean;
    repositoryUrl: string;
}
export interface RecommendationSearchResult {
    query: string;
    total: number;
    generatedAt: string;
    catalogUrl: string;
    items: RecommendationItem[];
}
export declare function recommendationResult(document: RankingsDocument, options: {
    query: string;
    limit?: number;
    category?: PluginCategoryId | null;
    installed?: Record<string, string>;
}): RecommendationSearchResult;
export declare function formatRecommendationResult(result: RecommendationSearchResult): string;
/** Register the bundled Skill and its catalog search tool when both DSH registries are available. */
export declare function installRecommendationCapabilities(ctx: Context, config: PluginResolvedConfig): void;
