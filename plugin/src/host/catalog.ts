/** Fetch and filter the published rankings document. */

import { isInstalledEntry, resolveInstallSpec } from "../install/install-spec.js";
import { entryMatchesCategory } from "../shared/categories.js";
import type {
  CatalogItem,
  RankingEntry,
  RankingsDocument,
  RankingView,
  PluginCategoryId,
} from "../shared/types.js";

export const DEFAULT_DATA_URL = "https://dsheval.ai/data";
const CACHE_MS = 5 * 60 * 1000;

export interface CatalogCache {
  dataUrl: string;
  fetchedAt: number;
  document: RankingsDocument;
}

let cache: CatalogCache | null = null;

export function normalizeDataUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("dataUrl must be http or https");
  }
  return raw.replace(/\/+$/, "");
}

export function isRankingView(value: string | null): value is RankingView {
  return value === "hot" || value === "rising" || value === "total" || value === "category";
}

export function matchesQuery(entry: RankingEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [
    entry.fullName,
    entry.name,
    entry.owner,
    entry.description,
    entry.descriptionZh,
    entry.type,
    ...(entry.tags ?? []),
    ...(entry.topics ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function annotate(entry: RankingEntry, installed: Record<string, string>): CatalogItem {
  const installSpec = resolveInstallSpec(entry);
  return {
    ...entry,
    installSpec,
    installable: installSpec !== null,
    installed: isInstalledEntry(entry, installed),
  };
}

export function filterCatalog(
  document: RankingsDocument,
  options: {
    view: RankingView;
    category: PluginCategoryId | null;
    query: string;
    offset: number;
    limit: number;
    installed: Record<string, string>;
  },
): { total: number; items: CatalogItem[] } {
  const source = options.query || options.view === "category"
    ? document.rankings.total
    : document.rankings[options.view] ?? [];
  const matched = source
    .filter((entry) => options.view !== "category" || (options.category !== null && entryMatchesCategory(entry, options.category)))
    .filter((entry) => matchesQuery(entry, options.query))
    .map((entry) => annotate(entry, options.installed));
  return {
    total: matched.length,
    items: matched.slice(options.offset, options.offset + options.limit),
  };
}

export function invalidateCatalog(): void {
  cache = null;
}

export async function loadRankings(dataUrl: string, force = false): Promise<RankingsDocument> {
  const url = `${normalizeDataUrl(dataUrl)}/rankings.json`;
  if (!force && cache && cache.dataUrl === url && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.document;
  }
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`rankings fetch failed: ${response.status} ${response.statusText}`);
  }
  const document = (await response.json()) as RankingsDocument;
  if (!document?.rankings || !Array.isArray(document.rankings.total)) {
    throw new Error("rankings.json is missing rankings.total");
  }
  document.rankings.hot = Array.isArray(document.rankings.hot) ? document.rankings.hot : [];
  document.rankings.rising = Array.isArray(document.rankings.rising) ? document.rankings.rising : [];
  cache = { dataUrl: url, fetchedAt: Date.now(), document };
  return document;
}

export function findEntry(document: RankingsDocument, fullName: string): RankingEntry | undefined {
  const needle = fullName.toLowerCase();
  return document.rankings.total.find((entry) => entry.fullName.toLowerCase() === needle);
}
