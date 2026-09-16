// plugin/src/shared/description-rules.ts
var DESCRIPTION_POLICY = "server-v1";
var PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
function cleanDescription(value) {
  return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim().replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, "$1").replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, "$1").trim();
}
function descriptionFor(entry) {
  if (entry.descriptionPolicy !== DESCRIPTION_POLICY || entry.descriptionStatus !== void 0) return PENDING_DESCRIPTION_ZH;
  if (typeof entry.descriptionZh !== "string") return PENDING_DESCRIPTION_ZH;
  return cleanDescription(entry.descriptionZh) || PENDING_DESCRIPTION_ZH;
}
function descriptionDisplayFor(entry) {
  const description = descriptionFor(entry);
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
  DESCRIPTION_POLICY,
  PENDING_DESCRIPTION_ZH,
  cleanDescription,
  descriptionDisplayFor,
  descriptionFor
};
