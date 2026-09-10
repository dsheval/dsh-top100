// plugin/src/shared/description-rules.ts
function matchesReviewedIdentity(entry, sourceInstall, sourceType) {
  if (sourceType !== void 0 && sourceType !== (entry.type ?? null)) return false;
  const packageName = entry.install?.packageName ?? entry.installPackageName ?? null;
  const repositoryPath = entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null;
  if (!sourceInstall) return packageName === null && repositoryPath === null;
  return sourceInstall.packageName === packageName && sourceInstall.repositoryPath === repositoryPath;
}
var PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
function isChineseDescription(value) {
  const hanCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (value.match(/[a-z]/gi) || []).length;
  return hanCount >= 6 && hanCount / (hanCount + latinCount) >= 0.2;
}
function cleanDescription(value) {
  return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim();
}
function isPlaceholder(value) {
  return !value || /^(?:版本更新提示[：:]|本次版本变化较大|较早的.+宿主请使用|[-\s🚨【]*国内用户核心前置)/u.test(value) || /资料不足|暂无.*简介|简介(?:正在生成|待生成)|用于扩展 DeepSeek Harness 能力|请(?:查看|参考).*(?:README|项目说明|项目文档)|求\s*Star|留颗\s*Star|顺手.*Star|欢迎.*(?:使用|贡献)|\|.*\|/i.test(value);
}
function descriptionFor(entry, reviewed = {}, context = {}) {
  const review = reviewed[String(entry.fullName || "").toLowerCase()];
  if (review && matchesReviewedIdentity(entry, review.sourceInstall, review.sourceType) && review.sourceDescription === (entry.description || "") && (review.sourceReadme === (entry.readmeSummary || "") || entry.readmeSummary === void 0 && Boolean(context.snapshotId) && review.snapshotId === context.snapshotId)) {
    if (review.suspended) return PENDING_DESCRIPTION_ZH;
    const chinese2 = cleanDescription(review.descriptionZh);
    if (!isPlaceholder(chinese2) && isChineseDescription(chinese2)) return chinese2;
  }
  const chinese = cleanDescription(entry.descriptionZh);
  if (chinese === PENDING_DESCRIPTION_ZH) return PENDING_DESCRIPTION_ZH;
  if (!isPlaceholder(chinese) && isChineseDescription(chinese)) return chinese;
  if (entry.install?.repositoryPath || entry.installRepositoryPath) return PENDING_DESCRIPTION_ZH;
  const original = cleanDescription(entry.description);
  return !isPlaceholder(original) && isChineseDescription(original) ? original : PENDING_DESCRIPTION_ZH;
}
export {
  PENDING_DESCRIPTION_ZH,
  cleanDescription,
  descriptionFor,
  isChineseDescription,
  isPlaceholder,
  matchesReviewedIdentity
};
