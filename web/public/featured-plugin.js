// plugin/src/shared/featured.ts
function isFeaturedRepository(entry) {
  return entry.fullName?.trim().toLowerCase() === "dsheval/dsh-top100";
}
function showFeaturedPlugin({
  view,
  query = "",
  category = null,
  catalogScope = "plugins",
  installAvailability = "all"
}) {
  return (view === "hot" || view === "rising" || view === "total") && !query.trim() && !category && catalogScope === "plugins" && installAvailability === "all";
}
export {
  isFeaturedRepository,
  showFeaturedPlugin
};
