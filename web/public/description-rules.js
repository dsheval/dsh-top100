// plugin/src/shared/description-rules.ts
function matchesReviewedIdentity(entry, sourceInstall, sourceType) {
  if (sourceType !== void 0 && sourceType !== (entry.type ?? null)) return false;
  const packageName = entry.install?.packageName ?? entry.installPackageName ?? null;
  const repositoryPath = entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null;
  if (!sourceInstall) return packageName === null && repositoryPath === null;
  return sourceInstall.packageName === packageName && sourceInstall.repositoryPath === repositoryPath && (!sourceInstall.functionEvidence || !!entry.install?.discovery?.evidence.includes(`reviewed-function-sha256:${sourceInstall.functionEvidence}`));
}
var PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
function matchesReviewedDescriptionSource(entry, review, context = {}, allowSelectedRootDescription = false) {
  if (!matchesReviewedIdentity(entry, review.sourceInstall, review.sourceType)) return false;
  if (review.enforceSourceMatch && entry.install?.discovery?.status && entry.install.discovery.status !== "verified") return false;
  if (review.sourceScope === "verified-function") return Boolean(review.sourceInstall?.functionEvidence);
  const documentHash = entry.install?.discovery?.readme?.documentSha256;
  if (review.sourceDocumentHashes?.length && documentHash && !review.sourceDocumentHashes.includes(documentHash)) return false;
  if (entry.readmeSummary === void 0 && review.enforceSourceMatch && cleanDescription(entry.descriptionZh) === review.descriptionZh) return true;
  return [review, ...review.sourceVariants ?? []].some((source) => (source.sourceDescription === (entry.description || "") || review.sourceScope === "selected-package" && !!entry.install?.repositoryPath && (allowSelectedRootDescription || !!review.sourceInstall?.functionEvidence || !!documentHash && !!review.sourceDocumentHashes?.includes(documentHash))) && (matchesReviewedReadme(entry.readmeSummary || "", source.sourceReadme) || entry.readmeSummary === void 0 && Boolean(context.snapshotId) && review.snapshotId === context.snapshotId));
}
function matchesReviewedReadme(current, reviewed) {
  const withoutLanguageSwitch = (value) => value.replace(/^(?:中文\s*\|\s*English|English\s*\|\s*中文)\s+/, "");
  return withoutLanguageSwitch(current) === withoutLanguageSwitch(reviewed);
}
function isChineseDescription(value) {
  const hanCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (value.match(/[a-z]/gi) || []).length;
  return hanCount >= 6 && hanCount / (hanCount + latinCount) >= 0.2;
}
function cleanDescription(value) {
  return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim().replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, "$1").replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, "$1").trim();
}
function isPlaceholder(value) {
  return !value || /^(?:版本更新提示[：:]|本次版本变化较大|较早的.+宿主请使用|[-\s🚨【]*国内用户核心前置)/u.test(value) || /资料不足|暂无.*简介|简介(?:正在生成|待生成)|用于扩展 DeepSeek Harness 能力|请(?:查看|参考).*(?:README|项目说明|项目文档)|求\s*Star|留颗\s*Star|顺手.*Star|欢迎.*(?:使用|贡献)|\|.*\|/i.test(value);
}
function descriptionQualityIssue(value) {
  const text = cleanDescription(value);
  if (!isChineseDescription(text) || isPlaceholder(text)) return null;
  if (/(?:…+|\.{3,}|[:：])$/.test(text)) return "\u7B80\u4ECB\u662F\u672A\u5B8C\u6210\u7684\u53E5\u5B50\u6216\u5217\u8868\u5F15\u5BFC\u8BED\u3002";
  if (/^(?:衷心|特别)?感谢|^致谢[：:]/.test(text)) return "\u7B80\u4ECB\u662F\u81F4\u8C22\uFF0C\u6CA1\u6709\u8BF4\u660E\u63D2\u4EF6\u7528\u9014\u3002";
  if (/^[·•\-\s]*(?:左|右|上|下)(?:图|侧)?[：:]/.test(text)) return "\u7B80\u4ECB\u662F\u8131\u79BB\u4E0A\u4E0B\u6587\u7684\u56FE\u7247\u8BF4\u660E\u3002";
  if (/^.{1,60}(?:源自|得名于|取名自).{0,40}(?:神话|女神|之名)/.test(text)) return "\u7B80\u4ECB\u53EA\u89E3\u91CA\u540D\u79F0\u6765\u5386\u3002";
  if (/^(?:PATH\s*上|(?:本)?仓库已提交|前提[：:])|^需要\s*(?:Node|pnpm|npm|官方\s*dsh)/i.test(text)) return "\u7B80\u4ECB\u53EA\u8BF4\u660E\u5B89\u88C5\u6216\u8FD0\u884C\u524D\u63D0\u3002";
  if (/^安装后.{0,30}(?:调用|使用)(?:本|该)?插件(?:注册|提供)的工具(?:即可)?[。！.]?$/.test(text)) return "\u7B80\u4ECB\u53EA\u6709\u901A\u7528\u5B89\u88C5\u4F7F\u7528\u8BF4\u660E\uFF0C\u6CA1\u6709\u8BF4\u660E\u5DE5\u5177\u7528\u9014\u3002";
  if (/^纯\s*(?:Node(?:\.js)?|Python|JavaScript|TypeScript)\s*实现[，,、\s]*(?:无网络(?:依赖)?[，,、\s]*)?(?:无外部服务)?[。.!！]?$/i.test(text)) return "\u7B80\u4ECB\u53EA\u6709\u5B9E\u73B0\u8BED\u8A00\u6216\u4F9D\u8D56\u8BF4\u660E\u3002";
  if (/^.{1,100}(?:是|属于).{0,70}(?:基础插件|基础组件)[。.!！]?$/.test(text)) return "\u7B80\u4ECB\u53EA\u8BF4\u660E\u7EC4\u4EF6\u8EAB\u4EFD\uFF0C\u6CA1\u6709\u8BF4\u660E\u529F\u80FD\u3002";
  if (/^(?:DeepSeek Harness|DSH).{0,20}(?:测试版|测试阶段|公开测试)/i.test(text)) return "\u7B80\u4ECB\u53EA\u8BF4\u660E\u5BBF\u4E3B\u7684\u6D4B\u8BD5\u72B6\u6001\u3002";
  if (/^配对\s*\d+\s*胜\s*\//.test(text)) return "\u7B80\u4ECB\u662F\u6D4B\u8BD5\u6210\u7EE9\uFF0C\u6CA1\u6709\u8BF4\u660E\u63D2\u4EF6\u7528\u9014\u3002";
  if (/^(?:摘一段[，,]\s*生一枝|把每一分模型开销[，,]\s*看得清清楚楚)[。！]?$/.test(text)) return "\u7B80\u4ECB\u53EA\u6709\u5BA3\u4F20\u53E3\u53F7\uFF0C\u6CA1\u6709\u8BF4\u660E\u5177\u4F53\u529F\u80FD\u3002";
  return null;
}
function isUsableChineseDescription(value) {
  const text = cleanDescription(value);
  return !isPlaceholder(text) && isChineseDescription(text) && !descriptionQualityIssue(text);
}
function hasInvalidSelectedPackage(entry) {
  return !!entry.install?.discovery?.evidence.some((value) => value.startsWith("selected-package-invalid:"));
}
function descriptionFor(entry, reviewed = {}, context = {}) {
  if (hasInvalidSelectedPackage(entry)) return PENDING_DESCRIPTION_ZH;
  const review = reviewed[String(entry.fullName || "").toLowerCase()];
  if (review?.reviewRequiredReason) return PENDING_DESCRIPTION_ZH;
  if (review && matchesReviewedDescriptionSource(entry, review, context)) {
    if (review.suspended) return PENDING_DESCRIPTION_ZH;
    const chinese2 = cleanDescription(review.descriptionZh);
    if (isUsableChineseDescription(chinese2)) return chinese2;
  }
  if (review?.enforceSourceMatch) return PENDING_DESCRIPTION_ZH;
  const chinese = cleanDescription(entry.descriptionZh);
  if (chinese === PENDING_DESCRIPTION_ZH) return PENDING_DESCRIPTION_ZH;
  if (isUsableChineseDescription(chinese)) return chinese;
  if (descriptionQualityIssue(chinese)) return PENDING_DESCRIPTION_ZH;
  if (entry.install?.repositoryPath || entry.installRepositoryPath) return PENDING_DESCRIPTION_ZH;
  const original = cleanDescription(entry.description);
  return isUsableChineseDescription(original) ? original : PENDING_DESCRIPTION_ZH;
}
function descriptionDisplayFor(entry, reviewed = {}, context = {}) {
  const description = descriptionFor(entry, reviewed, context);
  if (description !== PENDING_DESCRIPTION_ZH || !entry.descriptionStatus) return description;
  const labels = {
    "pending": "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210",
    "review-required": "\u4E2D\u6587\u7B80\u4ECB\u5F85\u590D\u6838",
    "missing-source": "\u4E2D\u6587\u7B80\u4ECB\u8D44\u6599\u4E0D\u8DB3",
    "retry": "\u4E2D\u6587\u7B80\u4ECB\u751F\u6210\u672A\u5B8C\u6210"
  };
  const label = labels[entry.descriptionStatus.state];
  return label ? `${label}\uFF1A${cleanDescription(entry.descriptionStatus.reason).slice(0, 200)}` : description;
}
export {
  PENDING_DESCRIPTION_ZH,
  cleanDescription,
  descriptionDisplayFor,
  descriptionFor,
  descriptionQualityIssue,
  hasInvalidSelectedPackage,
  isChineseDescription,
  isPlaceholder,
  isUsableChineseDescription,
  matchesReviewedDescriptionSource,
  matchesReviewedIdentity,
  matchesReviewedReadme
};
