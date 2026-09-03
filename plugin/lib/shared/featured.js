/** Editorial placement, never a catalog entry or a scoring input. */
export function showFeaturedPlugin({ view, query = "", category = null, catalogScope = "plugins", installAvailability = "all", }) {
    return (view === "hot" || view === "rising" || view === "total") && !query.trim() && !category
        && catalogScope === "plugins" && installAvailability === "all";
}
