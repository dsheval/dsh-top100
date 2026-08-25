/** Fetch and filter the published rankings document. */
import type { CatalogItem, RankingEntry, RankingsDocument, RankingView, PluginCategoryId } from "../shared/types.js";
export declare const DEFAULT_DATA_URL = "https://dsheval.ai/data";
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
}): {
    total: number;
    items: CatalogItem[];
};
export declare function invalidateCatalog(): void;
export declare function loadRankings(dataUrl: string, force?: boolean): Promise<RankingsDocument>;
export declare function findEntry(document: RankingsDocument, fullName: string): RankingEntry | undefined;
