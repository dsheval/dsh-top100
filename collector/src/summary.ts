/**
 * 智能摘要：在句子边界截断，不切断句子，截断处加省略号
 * （独立模块：index.ts 与 packs.ts 共用，避免循环依赖）
 */
export function summarizeReadme(text: string, maxLen = 420): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const boundary = Math.max(
    cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"),
    cut.lastIndexOf("；"), cut.lastIndexOf(". "), cut.lastIndexOf("! "),
    cut.lastIndexOf("? "), cut.lastIndexOf("; "), cut.lastIndexOf("："),
    cut.lastIndexOf(": ")
  );
  const end = boundary > maxLen * 0.45 ? boundary + 1 : maxLen;
  return clean.slice(0, end) + "…";
}
