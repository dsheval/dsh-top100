/** Presentation contract only. Editorial decisions belong to the publisher. */
export const DESCRIPTION_POLICY = 'server-v1' as const;
export const PENDING_DESCRIPTION_ZH = '中文简介待生成。';
export interface DescriptionStatus {
  state: 'pending' | 'review-required' | 'missing-source' | 'retry' | 'stale';
  /** Stale model output uses generatedAt; a reviewed version uses reviewedAt. */
  origin?: 'model';
  generatedAt?: string;
  reviewedAt?: string;
  reason: string;
}
export interface DescriptionEntry {
  descriptionPolicy?: string;
  descriptionZh?: string | null;
  descriptionStatus?: DescriptionStatus;
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

/** Validate the calendar date without accepting JavaScript's invalid-date rollover. */
export function isDescriptionReviewDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Invalid server status fails closed; clients do not invent missing review evidence. */
export function descriptionStatusFor(value: unknown): DescriptionStatus | undefined {
  if (value === undefined) return undefined;
  if (value && typeof value === 'object') {
    const status = value as Record<string, unknown>;
    if (typeof status.state === 'string' && ['pending', 'review-required', 'missing-source', 'retry', 'stale'].includes(status.state)
      && typeof status.reason === 'string' && (status.origin === undefined || status.origin === 'model')
      && (status.state !== 'stale' || isDescriptionReviewDate(status.origin === 'model' ? status.generatedAt : status.reviewedAt))) {
      return { state: status.state as DescriptionStatus['state'], reason: cleanDescription(status.reason).slice(0, 200),
        ...(status.origin === 'model' ? { origin: 'model' as const } : {}),
        ...(isDescriptionReviewDate(status.generatedAt) ? { generatedAt: status.generatedAt } : {}),
        ...(isDescriptionReviewDate(status.reviewedAt) ? { reviewedAt: status.reviewedAt } : {}) };
    }
  }
  return { state: 'review-required', reason: '服务端简介状态无效，等待复核。' };
}

/** Never infer a summary from author metadata, a README or an older local review. */
export function descriptionFor(entry: DescriptionEntry): string {
  if (entry.descriptionPolicy !== DESCRIPTION_POLICY) return PENDING_DESCRIPTION_ZH;
  const status = descriptionStatusFor(entry.descriptionStatus);
  if (status !== undefined && status.state !== 'stale') return PENDING_DESCRIPTION_ZH;
  if (typeof entry.descriptionZh !== 'string') return PENDING_DESCRIPTION_ZH;
  return cleanDescription(entry.descriptionZh) || PENDING_DESCRIPTION_ZH;
}
export function descriptionDisplayFor(entry: DescriptionEntry): string {
  const description = descriptionFor(entry);
  const status = descriptionStatusFor(entry.descriptionStatus);
  if (status?.state === 'stale') {
    // Put the qualification first so a collapsed summary cannot look freshly verified.
    if (description === PENDING_DESCRIPTION_ZH) return '中文简介待复核：旧简介正文缺失，等待服务端核查。';
    return status.origin === 'model'
      ? `生成于 ${status.generatedAt}，来源待核查，简介待更新。${description}`
      : `上次核验 ${status.reviewedAt}，来源核查中，简介待更新。${description}`;
  }
  if (description !== PENDING_DESCRIPTION_ZH || !status) return description;
  const labels = { 'pending': '中文简介待生成', 'review-required': '中文简介待复核',
    'missing-source': '中文简介资料不足', 'retry': '中文简介生成未完成' };
  const label = labels[status.state];
  return `${label}${status.reason ? `：${status.reason}` : '。'}`;
}
