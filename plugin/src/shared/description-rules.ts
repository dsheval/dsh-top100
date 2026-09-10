export interface DescriptionEntry {
  fullName?: string;
  description?: string;
  descriptionZh?: string;
  readmeSummary?: string;
  type?: string;
  install?: { packageName?: string | null; repositoryPath?: string | null };
  installPackageName?: string | null;
  installRepositoryPath?: string | null;
}
export interface ReviewedInstallIdentity {
  packageName: string | null;
  repositoryPath: string | null;
}
/** Full and compact catalogs must identify the same reviewed package. */
export function matchesReviewedIdentity(
  entry: Pick<DescriptionEntry, 'install' | 'installPackageName' | 'installRepositoryPath' | 'type'>,
  sourceInstall?: ReviewedInstallIdentity,
  sourceType?: string | null,
): boolean {
  if (sourceType !== undefined && sourceType !== (entry.type ?? null)) return false;
  const packageName = entry.install?.packageName ?? entry.installPackageName ?? null;
  const repositoryPath = entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null;
  // Unbound historical records cannot establish the identity of an installed package.
  if (!sourceInstall) return packageName === null && repositoryPath === null;
  return sourceInstall.packageName === packageName && sourceInstall.repositoryPath === repositoryPath;
}
export interface DescriptionContext { snapshotId?: string; }
export interface ReviewedDescription {
  descriptionZh: string;
  /** Withdraw a known incorrect description until this exact source is reviewed again. */
  suspended?: boolean;
  sourceDescription: string;
  sourceReadme: string;
  snapshotId?: string;
  sourceInstall?: ReviewedInstallIdentity;
  sourceType?: string | null;
}
export type ReviewedDescriptions = Record<string, ReviewedDescription>;
export const PENDING_DESCRIPTION_ZH = '中文简介待生成。';

/** Allow product names, but a few Chinese words must not validate an English paragraph. */
export function isChineseDescription(value: string): boolean {
  const hanCount = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (value.match(/[a-z]/gi) || []).length;
  return hanCount >= 6 && hanCount / (hanCount + latinCount) >= 0.2;
}

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
  return !value || /^(?:版本更新提示[：:]|本次版本变化较大|较早的.+宿主请使用|[-\s🚨【]*国内用户核心前置)/u.test(value) || /资料不足|暂无.*简介|简介(?:正在生成|待生成)|用于扩展 DeepSeek Harness 能力|请(?:查看|参考).*(?:README|项目说明|项目文档)|求\s*Star|留颗\s*Star|顺手.*Star|欢迎.*(?:使用|贡献)|\|.*\|/i.test(value);
}
export function descriptionFor(entry: DescriptionEntry, reviewed: ReviewedDescriptions = {}, context: DescriptionContext = {}): string {
  const review = reviewed[String(entry.fullName || '').toLowerCase()];
  // Invalidate editorial text when its evidence changes, rather than pinning stale claims.
  if (review && matchesReviewedIdentity(entry, review.sourceInstall, review.sourceType) && review.sourceDescription === (entry.description || '') && (
    review.sourceReadme === (entry.readmeSummary || '')
    || (entry.readmeSummary === undefined && Boolean(context.snapshotId) && review.snapshotId === context.snapshotId)
  )) {
    if (review.suspended) return PENDING_DESCRIPTION_ZH;
    const chinese = cleanDescription(review.descriptionZh);
    if (!isPlaceholder(chinese) && isChineseDescription(chinese)) return chinese;
  }
  const chinese = cleanDescription(entry.descriptionZh);
  // The publisher explicitly withheld this summary. Compact entries may omit
  // the README needed to recheck its review; never restore root-product claims.
  if (chinese === PENDING_DESCRIPTION_ZH) return PENDING_DESCRIPTION_ZH;
  if (!isPlaceholder(chinese) && isChineseDescription(chinese)) return chinese;
  if (entry.install?.repositoryPath || entry.installRepositoryPath) return PENDING_DESCRIPTION_ZH;
  const original = cleanDescription(entry.description);
  return !isPlaceholder(original) && isChineseDescription(original) ? original : PENDING_DESCRIPTION_ZH;
}
