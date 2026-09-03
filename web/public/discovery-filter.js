import { createSearchScorer, tokenizeSearchQuery } from "./search-engine.js";
import { catalogPresentation } from "./catalog-presentation.js";

/** Text search always covers the full Plugin catalog, regardless of the browsing tab. */
export function requiresSearchIndex(view, query, installableOnly) {
  return tokenizeSearchQuery(query).length > 0 || (view === "all" && installableOnly);
}

export function filterDiscoveryEntries(entries, { query = "", category = null, installableOnly = false, sort = "relevance" } = {}, matchesCategory = () => true) {
  const score = createSearchScorer(query);
  const matches = [];
  for (const entry of entries) {
    if (category && !matchesCategory(entry, category)) continue;
    if (installableOnly && !catalogPresentation(entry.plugin).installable) continue;
    const relevance = score(entry.plugin);
    if (relevance !== null) matches.push({ entry, relevance });
  }
  if (tokenizeSearchQuery(query).length > 0) {
    matches.sort((left, right) =>
      (sort === "relevance" ? right.relevance - left.relevance : 0) || left.entry.rank - right.entry.rank);
  }
  return matches.map(({ entry }) => entry);
}
