/** Editorial placement, never a catalog entry or a scoring input. */
export function isFeaturedRepository(entry: { fullName?: string }): boolean {
  return entry.fullName?.trim().toLowerCase() === "dsheval/dsh-top100";
}

export function showFeaturedPlugin({
  view,
  query = "",
  category = null,
  catalogScope = "plugins",
  installAvailability = "all",
}: {
  view: string;
  query?: string;
  category?: string | null;
  catalogScope?: string;
  installAvailability?: string;
}): boolean {
  return (view === "hot" || view === "rising" || view === "total") && !query.trim() && !category
    && catalogScope === "plugins" && installAvailability === "all";
}
