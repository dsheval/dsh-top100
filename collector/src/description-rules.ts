export interface DescriptionEntry {
  fullName?: string;
  description?: string;
  descriptionZh?: string;
  descriptionStatus?: DescriptionStatus;
  readmeSummary?: string;
  type?: string;
  install?: { packageName?: string | null; repositoryPath?: string | null; discovery?: { evidence: string[]; status?: string; readme?: { documentSha256: string }; skill?: { name: string; path: string; documentSha256: string } } };
  installPackageName?: string | null;
  installRepositoryPath?: string | null;
}
export interface DescriptionStatus {
  state: 'pending' | 'review-required' | 'missing-source' | 'retry' | 'stale';
  reviewedAt?: string;
  origin?: 'model';
  generatedAt?: string;
  reason: string;
}
export interface ReviewedInstallIdentity {
  packageName: string | null;
  repositoryPath: string | null;
  functionEvidence?: string;
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
  return sourceInstall.packageName === packageName && sourceInstall.repositoryPath === repositoryPath
    && (!sourceInstall.functionEvidence || !!entry.install?.discovery?.evidence.includes(`reviewed-function-sha256:${sourceInstall.functionEvidence}`));
}
export interface DescriptionContext { snapshotId?: string; }
export interface ReviewedDescription {
  reviewedAt?: string;
  /** Exact publication evidence approval; never replaces a function/category baseline. */
  publicationReview?: { sourceHash: string; reviewedAt: string; descriptionZh: string };
  /** A selected Skill review binds both its location and complete document. */
  sourceSkill?: { name: string; path: string; documentSha256: string };
  sourceScope?: string;
  /** Explicitly reviewed revisions; never a wildcard for subsequent changes. */
  sourceVariants?: Array<{ sourceDescription: string; sourceReadme: string }>;
  /** Checked full documents also catch changes beyond the legacy short excerpt. */
  sourceDocumentHashes?: string[];
  /** Opt-in migrations cannot recover unreviewed text from old caches. */
  enforceSourceMatch?: boolean;
  /** A deliberate hold survives metadata changes until explicitly resolved. */
  reviewRequiredReason?: string;
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

/** Server-only source binding and editorial policy. */
export function matchesReviewedDescriptionSource(entry: DescriptionEntry, review: ReviewedDescription,
  context: DescriptionContext = {}, allowSelectedRootDescription = false): boolean {
  if (!matchesReviewedIdentity(entry, review.sourceInstall, review.sourceType)) return false;
  if (review.enforceSourceMatch && entry.install?.discovery?.status
    && entry.install.discovery.status !== 'verified') return false;
  if (review.sourceScope === 'verified-function') return Boolean(review.sourceInstall?.functionEvidence);
  if (review.sourceSkill) {
    const skill = entry.install?.discovery?.skill;
    if (skill ? skill.name !== review.sourceSkill.name || skill.path !== review.sourceSkill.path
      || skill.documentSha256 !== review.sourceSkill.documentSha256 : entry.readmeSummary !== undefined) return false;
  }
  const documentHash = entry.install?.discovery?.readme?.documentSha256;
  if (review.sourceDocumentHashes?.length && documentHash && !review.sourceDocumentHashes.includes(documentHash)) return false;
  // A compact published row carries the collector's explicit result. Pending
  // rows must stay pending; old unrelated text cannot become a reviewed result.
  if (entry.readmeSummary === undefined && review.enforceSourceMatch
    && cleanDescription(entry.descriptionZh) === review.descriptionZh) return true;
  return [review, ...(review.sourceVariants ?? [])].some(source =>
    (source.sourceDescription === (entry.description || '')
      || review.sourceScope === 'selected-package' && !!entry.install?.repositoryPath
        && (allowSelectedRootDescription || !!review.sourceInstall?.functionEvidence
          || !!documentHash && !!review.sourceDocumentHashes?.includes(documentHash)))
    && (matchesReviewedReadme(entry.readmeSummary || '', source.sourceReadme)
      || entry.readmeSummary === undefined && Boolean(context.snapshotId) && review.snapshotId === context.snapshotId));
}

/** A leading language switch is navigation, not a change to reviewed functionality.
 * Keep the rest of the source exact, including numbers, versions and missing text.
 */
export function matchesReviewedReadme(current: string, reviewed: string): boolean {
  const withoutLanguageSwitch = (value: string) => value.replace(/^(?:中文\s*\|\s*English|English\s*\|\s*中文)\s+/, '');
  return withoutLanguageSwitch(current) === withoutLanguageSwitch(reviewed);
}

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
    .replace(/\s+/g, ' ').trim()
    // Strip only an isolated leading language switch, keeping the useful body
    // and optional package heading. This is presentation, never source rebinding.
    .replace(/^((?:[\w@/.-]+\s+)?)(?:简体中文|中文)\s*[|·]\s*English\s*/i, '$1')
    .replace(/^((?:[\w@/.-]+\s+)?)English\s*[|·]\s*(?:简体中文|中文)\s*/i, '$1').trim();
}
export function isPlaceholder(value: string): boolean {
  return !value || /^(?:版本更新提示[：:]|本次版本变化较大|较早的.+宿主请使用|[-\s🚨【]*国内用户核心前置)/u.test(value) || /资料不足|暂无.*简介|简介(?:正在生成|待生成)|用于扩展 DeepSeek Harness 能力|请(?:查看|参考).*(?:README|项目说明|项目文档)|求\s*Star|留颗\s*Star|顺手.*Star|欢迎.*(?:使用|贡献)|\|.*\|/i.test(value);
}

/** Reject recognisable non-descriptions, not a claim of semantic verification.
 * Used by collection, model-output validation and publication coverage.
 */
export function descriptionQualityIssue(value: string | null | undefined): string | null {
  const text = cleanDescription(value);
  if (!isChineseDescription(text) || isPlaceholder(text)) return null;
  if (/(?:…+|\.{3,}|[:：])$/.test(text)) return '简介是未完成的句子或列表引导语。';
  if (/^(?:衷心|特别)?感谢|^致谢[：:]/.test(text)) return '简介是致谢，没有说明插件用途。';
  if (/^[·•\-\s]*(?:左|右|上|下)(?:图|侧)?[：:]/.test(text)) return '简介是脱离上下文的图片说明。';
  if (/^.{1,60}(?:源自|得名于|取名自).{0,40}(?:神话|女神|之名)/.test(text)) return '简介只解释名称来历。';
  if (/^(?:PATH\s*上|(?:本)?仓库已提交|前提[：:])|^需要\s*(?:Node|pnpm|npm|官方\s*dsh)/i.test(text)) return '简介只说明安装或运行前提。';
  if (/^安装后.{0,30}(?:调用|使用)(?:本|该)?插件(?:注册|提供)的工具(?:即可)?[。！.]?$/.test(text)) return '简介只有通用安装使用说明，没有说明工具用途。';
  if (/^纯\s*(?:Node(?:\.js)?|Python|JavaScript|TypeScript)\s*实现[，,、\s]*(?:无网络(?:依赖)?[，,、\s]*)?(?:无外部服务)?[。.!！]?$/i.test(text)) return '简介只有实现语言或依赖说明。';
  if (/^.{1,100}(?:是|属于).{0,70}(?:基础插件|基础组件)[。.!！]?$/.test(text)) return '简介只说明组件身份，没有说明功能。';
  if (/^(?:DeepSeek Harness|DSH).{0,20}(?:测试版|测试阶段|公开测试)/i.test(text)) return '简介只说明宿主的测试状态。';
  if (/^配对\s*\d+\s*胜\s*\//.test(text)) return '简介是测试成绩，没有说明插件用途。';
  if (/^(?:摘一段[，,]\s*生一枝|把每一分模型开销[，,]\s*看得清清楚楚)[。！]?$/.test(text)) return '简介只有宣传口号，没有说明具体功能。';
  return null;
}

export function isUsableChineseDescription(value: string): boolean {
  const text = cleanDescription(value);
  return !isPlaceholder(text) && isChineseDescription(text) && !descriptionQualityIssue(text);
}
export function hasInvalidSelectedPackage(entry: Pick<DescriptionEntry, 'install'>): boolean {
  return !!entry.install?.discovery?.evidence.some(value => value.startsWith('selected-package-invalid:'));
}
export function descriptionFor(entry: DescriptionEntry, reviewed: ReviewedDescriptions = {}, context: DescriptionContext = {}): string {
  if (hasInvalidSelectedPackage(entry)) return PENDING_DESCRIPTION_ZH;
  const review = reviewed[String(entry.fullName || '').toLowerCase()];
  if (review?.reviewRequiredReason) return PENDING_DESCRIPTION_ZH;
  // Invalidate editorial text when its evidence changes, rather than pinning stale claims.
  if (review && matchesReviewedDescriptionSource(entry, review, context)) {
    if (review.suspended) return PENDING_DESCRIPTION_ZH;
    const chinese = cleanDescription(review.descriptionZh);
    if (isUsableChineseDescription(chinese)) return chinese;
  }
  if (review?.enforceSourceMatch) return PENDING_DESCRIPTION_ZH;
  const chinese = cleanDescription(entry.descriptionZh);
  // The publisher explicitly withheld this summary. Compact entries may omit
  // the README needed to recheck its review; never restore root-product claims.
  if (chinese === PENDING_DESCRIPTION_ZH) return PENDING_DESCRIPTION_ZH;
  if (isUsableChineseDescription(chinese)) return chinese;
  // An explicitly supplied but rejected summary needs review; do not conceal
  // that failure by falling back to unrelated root metadata in the browser.
  if (descriptionQualityIssue(chinese)) return PENDING_DESCRIPTION_ZH;
  if (entry.install?.repositoryPath || entry.installRepositoryPath) return PENDING_DESCRIPTION_ZH;
  const original = cleanDescription(entry.description);
  return isUsableChineseDescription(original) ? original : PENDING_DESCRIPTION_ZH;
}

/** Status text is for display only; it must never count as a completed summary. */
export function descriptionDisplayFor(entry: DescriptionEntry, reviewed: ReviewedDescriptions = {}, context: DescriptionContext = {}): string {
  const description = descriptionFor(entry, reviewed, context);
  if (description !== PENDING_DESCRIPTION_ZH || !entry.descriptionStatus) return description;
  const labels = { 'pending': '中文简介待生成', 'review-required': '中文简介待复核',
    'missing-source': '中文简介资料不足', 'retry': '中文简介生成未完成', 'stale': '中文简介待更新' };
  const label = labels[entry.descriptionStatus.state];
  return label ? `${label}：${cleanDescription(entry.descriptionStatus.reason).slice(0, 200)}` : description;
}
