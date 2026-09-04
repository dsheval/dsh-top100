export interface DescriptionEntry {
  fullName?: string;
  description?: string;
  descriptionZh?: string;
  readmeSummary?: string;
}
export interface DescriptionContext { snapshotId?: string; }
export interface ReviewedDescription {
  descriptionZh: string;
  sourceDescription: string;
  sourceReadme: string;
  snapshotId?: string;
}
export type ReviewedDescriptions = Record<string, ReviewedDescription>;

/** Shared display rules; raw repository text is always rendered via textContent. */
export function cleanDescription(value: unknown): string {
  return String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[`*_~>#]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
export function isPlaceholder(value: string): boolean {
  return !value || /资料不足|暂无.*简介|简介正在生成|用于扩展 DeepSeek Harness 能力|请(?:查看|参考).*(?:README|项目说明|项目文档)|求\s*Star|留颗\s*Star|顺手.*Star|欢迎.*(?:使用|贡献)|\|.*\|/i.test(value);
}
export function descriptionFor(entry: DescriptionEntry, reviewed: ReviewedDescriptions = {}, context: DescriptionContext = {}): string {
  const review = reviewed[String(entry.fullName || '').toLowerCase()];
  // Invalidate editorial text when its evidence changes, rather than pinning stale claims.
  if (review && review.sourceDescription === (entry.description || '') && (
    review.sourceReadme === (entry.readmeSummary || '')
    || (entry.readmeSummary === undefined && Boolean(context.snapshotId) && review.snapshotId === context.snapshotId)
  )) {
    return review.descriptionZh;
  }
  const chinese = cleanDescription(entry.descriptionZh);
  if (!isPlaceholder(chinese) && /[\u4e00-\u9fff]/.test(chinese)) return chinese;
  const original = cleanDescription(entry.description);
  return isPlaceholder(original) ? '暂无简介' : original;
}
