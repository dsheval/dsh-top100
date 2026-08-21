/**
 * 中文化工具：摘要相似度 + 「变化量触发」重翻判定
 * 让中文简介在 README 实质大改时刷新，小改动不重翻（平衡翻译频率与不过时）
 */

export interface ZhEntry {
  descriptionZh: string;
  tagsZh: string[];
  /** 上次翻译时的 README 摘要指纹——README 实质大改才重翻 */
  summaryKey?: string;
}

/** 摘要相似度：bigram Dice 系数（对 200-400 字符的摘要足够快足够准） */
export function summarySimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const sa = grams(a);
  const sb = grams(b);
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  return (2 * inter) / (sa.size + sb.size || 1);
}

export const RETRANSLATE_THRESHOLD = 0.6;

/** 是否应重新翻译中文简介：README 摘要与上次翻译时相比实质大改（相似度 < 阈值）
 * 当前无摘要 → 不重翻；无历史指纹（旧缓存/首次）→ 不重翻（只记录指纹），避免首次把存量全翻 */
export function shouldRetranslate(
  currentSummary: string | null,
  cachedSummaryKey?: string
): boolean {
  if (!currentSummary) return false;
  if (!cachedSummaryKey) return false;
  return summarySimilarity(currentSummary, cachedSummaryKey) < RETRANSLATE_THRESHOLD;
}
