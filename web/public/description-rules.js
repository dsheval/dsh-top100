// plugin/src/shared/description-rules.ts
var DESCRIPTION_POLICY = "server-v1";
var PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
function cleanDescription(value) {
  return String(value ?? "").replace(/```[\s\S]*?```/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/[`*_~>#]/g, " ").replace(/\s+/g, " ").trim().replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, "$1").replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, "$1").trim();
}
function isDescriptionReviewDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function descriptionStatusFor(value) {
  if (value === void 0) return void 0;
  if (value && typeof value === "object") {
    const status = value;
    if (typeof status.state === "string" && ["pending", "review-required", "missing-source", "retry", "stale"].includes(status.state) && typeof status.reason === "string" && (status.origin === void 0 || status.origin === "model") && (status.state !== "stale" || isDescriptionReviewDate(status.origin === "model" ? status.generatedAt : status.reviewedAt))) {
      return {
        state: status.state,
        reason: cleanDescription(status.reason).slice(0, 200),
        ...status.origin === "model" ? { origin: "model" } : {},
        ...isDescriptionReviewDate(status.generatedAt) ? { generatedAt: status.generatedAt } : {},
        ...isDescriptionReviewDate(status.reviewedAt) ? { reviewedAt: status.reviewedAt } : {}
      };
    }
  }
  return { state: "review-required", reason: "\u670D\u52A1\u7AEF\u7B80\u4ECB\u72B6\u6001\u65E0\u6548\uFF0C\u7B49\u5F85\u590D\u6838\u3002" };
}
function descriptionFor(entry) {
  if (entry.descriptionPolicy !== DESCRIPTION_POLICY) return PENDING_DESCRIPTION_ZH;
  const status = descriptionStatusFor(entry.descriptionStatus);
  if (status !== void 0 && status.state !== "stale") return PENDING_DESCRIPTION_ZH;
  if (typeof entry.descriptionZh !== "string") return PENDING_DESCRIPTION_ZH;
  return cleanDescription(entry.descriptionZh) || PENDING_DESCRIPTION_ZH;
}
function descriptionDisplayFor(entry) {
  const description = descriptionFor(entry);
  const status = descriptionStatusFor(entry.descriptionStatus);
  if (status?.state === "stale") {
    if (description === PENDING_DESCRIPTION_ZH) return "\u4E2D\u6587\u7B80\u4ECB\u5F85\u590D\u6838\uFF1A\u65E7\u7B80\u4ECB\u6B63\u6587\u7F3A\u5931\uFF0C\u7B49\u5F85\u670D\u52A1\u7AEF\u6838\u67E5\u3002";
    return status.origin === "model" ? `\u751F\u6210\u4E8E ${status.generatedAt}\uFF0C\u6765\u6E90\u5F85\u6838\u67E5\uFF0C\u7B80\u4ECB\u5F85\u66F4\u65B0\u3002${description}` : `\u4E0A\u6B21\u6838\u9A8C ${status.reviewedAt}\uFF0C\u6765\u6E90\u6838\u67E5\u4E2D\uFF0C\u7B80\u4ECB\u5F85\u66F4\u65B0\u3002${description}`;
  }
  if (description !== PENDING_DESCRIPTION_ZH || !status) return description;
  const labels = {
    "pending": "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210",
    "review-required": "\u4E2D\u6587\u7B80\u4ECB\u5F85\u590D\u6838",
    "missing-source": "\u4E2D\u6587\u7B80\u4ECB\u8D44\u6599\u4E0D\u8DB3",
    "retry": "\u4E2D\u6587\u7B80\u4ECB\u751F\u6210\u672A\u5B8C\u6210"
  };
  const label = labels[status.state];
  return `${label}${status.reason ? `\uFF1A${status.reason}` : "\u3002"}`;
}
export {
  DESCRIPTION_POLICY,
  PENDING_DESCRIPTION_ZH,
  cleanDescription,
  descriptionDisplayFor,
  descriptionFor,
  descriptionStatusFor,
  isDescriptionReviewDate
};
