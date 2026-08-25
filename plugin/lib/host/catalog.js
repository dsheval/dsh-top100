/** Fetch and filter the published rankings document. */
import { isInstalledEntry, resolveInstallSpec } from "../install/install-spec.js";
import { entryMatchesCategory } from "../shared/categories.js";
import { matchesSearchQuery, scoreSearchEntry, tokenizeSearchQuery } from "../shared/search.js";
export const DEFAULT_DATA_URL = "https://www.dsheval.ai/data";
const CACHE_MS = 5 * 60 * 1000;
let cache = null;
export function normalizeDataUrl(raw) {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("dataUrl must be http or https");
    }
    return raw.replace(/\/+$/, "");
}
export function isRankingView(value) {
    return value === "hot" || value === "rising" || value === "total" || value === "category";
}
export function matchesQuery(entry, query) {
    return matchesSearchQuery(entry, query);
}
function annotate(entry, installed) {
    const installSpec = resolveInstallSpec(entry);
    return {
        ...entry,
        installSpec,
        installable: installSpec !== null,
        installed: isInstalledEntry(entry, installed),
    };
}
export function filterCatalog(document, options) {
    const hasQuery = tokenizeSearchQuery(options.query).length > 0;
    const source = hasQuery || options.view === "category"
        ? document.rankings.total
        : document.rankings[options.view] ?? [];
    const scored = source
        .filter((entry) => options.view !== "category" || (options.category !== null && entryMatchesCategory(entry, options.category)))
        .map((entry) => ({ entry, score: scoreSearchEntry(entry, options.query) }))
        .filter((item) => item.score !== null);
    if (hasQuery) {
        scored.sort((left, right) => right.score - left.score || left.entry.rank - right.entry.rank);
    }
    const matched = scored.map(({ entry }) => annotate(entry, options.installed));
    return {
        total: matched.length,
        items: matched.slice(options.offset, options.offset + options.limit),
    };
}
export function invalidateCatalog() {
    cache = null;
}
export async function loadRankings(dataUrl, force = false) {
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
    const document = (await response.json());
    if (!document?.rankings || !Array.isArray(document.rankings.total)) {
        throw new Error("rankings.json is missing rankings.total");
    }
    document.rankings.hot = Array.isArray(document.rankings.hot) ? document.rankings.hot : [];
    document.rankings.rising = Array.isArray(document.rankings.rising) ? document.rankings.rising : [];
    cache = { dataUrl: url, fetchedAt: Date.now(), document };
    return document;
}
export function findEntry(document, fullName) {
    const needle = fullName.toLowerCase();
    return document.rankings.total.find((entry) => entry.fullName.toLowerCase() === needle);
}
