// plugin/src/shared/featured.ts
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
  showFeaturedPlugin
};
