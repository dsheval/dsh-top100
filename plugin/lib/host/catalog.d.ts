/** Fetch and filter the published rankings document. */
import type { CatalogCacheStatus, CatalogItem, RankingEntry, RankingsDocument, RankingView, PluginCategoryId } from "../shared/types.js";
export declare const DEFAULT_DATA_URL = "https://www.dsheval.ai/data";
export interface CatalogCache {
    dataUrl: string;
    fetchedAt: number;
    document: RankingsDocument;
}
export declare function normalizeDataUrl(raw: string): string;
export declare function isRankingView(value: string | null): value is RankingView;
export declare function matchesQuery(entry: RankingEntry, query: string): boolean;
export declare function filterCatalog(document: RankingsDocument, options: {
    view: RankingView;
    category: PluginCategoryId | null;
    query: string;
    offset: number;
    limit: number;
    installed: Record<string, string>;
    excludeSkills?: boolean;
    compatibleOnly?: boolean;
}): {
    total: number;
    items: CatalogItem[];
};
export declare function invalidateCatalog(): void;
export declare function describeCatalogFetchError(error: unknown): string;
export declare function isRetryableCatalogFetchError(error: unknown): boolean;
export declare function parseRankingsDocument(raw: string): RankingsDocument;
export declare function parseRankingViewDocument(raw: string, view: "hot" | "rising"): RankingsDocument;
export declare function parseRankingSearchDocument(raw: string): RankingsDocument;
export declare function loadRankings(dataUrl: string, force?: boolean): Promise<RankingsDocument>;
/** Load the compact all-entry index used by total/category/search views. */
export declare function loadSearchRankings(dataUrl: string, force?: boolean): Promise<RankingsDocument>;
export declare function catalogCacheStatus(dataUrl: string, dataset: CatalogCacheStatus["dataset"], view?: "hot" | "rising"): Promise<CatalogCacheStatus>;
/** Return a last-good full or view cache without ever delaying local management on the network. */
export declare function loadCachedRankings(dataUrl: string): Promise<RankingsDocument | null>;
/** Resolve installation metadata from a current, authoritative full catalog snapshot. */
export declare function findPublishedEntry(dataUrl: string, fullName: string): Promise<RankingEntry | undefined>;
/** Load the small published shard used by the initial hot/rising tabs. */
export declare function loadRankingView(dataUrl: string, view: "hot" | "rising", force?: boolean): Promise<RankingsDocument>;
export declare function findEntry(document: RankingsDocument, fullName: string): RankingEntry | undefined;
