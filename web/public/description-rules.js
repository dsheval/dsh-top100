// plugin/src/shared/description-rules.ts
function cleanDescription(value) {
  return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim();
}
function isPlaceholder(value) {
  return !value || /资料不足|暂无.*简介|简介正在生成|用于扩展 DeepSeek Harness 能力|请(?:查看|参考).*(?:README|项目说明|项目文档)|求\s*Star|留颗\s*Star|顺手.*Star|欢迎.*(?:使用|贡献)|\|.*\|/i.test(value);
}
function descriptionFor(entry, reviewed = {}, context = {}) {
  const review = reviewed[String(entry.fullName || "").toLowerCase()];
  if (review && review.sourceDescription === (entry.description || "") && (review.sourceReadme === (entry.readmeSummary || "") || entry.readmeSummary === void 0 && Boolean(context.snapshotId) && review.snapshotId === context.snapshotId)) {
    return review.descriptionZh;
  }
  const chinese = cleanDescription(entry.descriptionZh);
  if (!isPlaceholder(chinese) && /[\u4e00-\u9fff]/.test(chinese)) return chinese;
  const original = cleanDescription(entry.description);
  return isPlaceholder(original) ? "\u6682\u65E0\u7B80\u4ECB" : original;
}
export {
  cleanDescription,
  descriptionFor,
  isPlaceholder
};
