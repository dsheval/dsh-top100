/** Lightweight weighted search shared by the DSH plugin host. */

import type { RankingEntry } from "./types.js";

const SYNONYM_GROUPS = [
  ["图片", "图像", "视觉", "ocr", "image", "vision"],
  ["搜索", "检索", "查找", "search", "retrieval"],
  ["浏览器", "网页", "web", "browser"],
  ["代码", "编程", "开发", "code", "coding"],
  ["终端", "命令行", "shell", "cli", "terminal"],
  ["文档", "知识库", "document", "docs", "knowledge"],
  ["消息", "通知", "飞书", "message", "messages", "messaging", "notification", "notifications", "slack", "webhook"],
  ["自动化", "工作流", "automation", "workflow"],
  ["测试", "评测", "评估", "test", "eval", "evaluation"],
  ["智能体", "代理", "agent"],
  ["数据库", "sql", "database"],
  ["记忆", "memory"],
  ["安全", "security"],
  ["监控", "观测", "monitoring", "observability"],
] as const;

const STOP_WORDS = new Set([
  "我", "想", "我想", "找", "找个", "一个", "一款", "可以", "能够", "用于", "支持", "相关",
  "有没有", "帮我", "需要", "这个", "那个", "的", "了", "一下", "插件", "工具", "功能", "处理", "管理",
  "please", "find", "show", "me", "a", "an", "the", "plugin", "tool", "for", "with",
]);

const segmenter = "Segmenter" in Intl
  ? new Intl.Segmenter("zh-CN", { granularity: "word" })
  : null;

// Preserve domain terms such as 浏览器; Intl.Segmenter may split it into 浏览 + 器,
// which would bypass the Chinese/English synonym group entirely.
const chineseTerms = [...new Set(SYNONYM_GROUPS.flat().filter((word) => /\p{Script=Han}/u.test(word)))];
const chineseTermPattern = new RegExp(`(${chineseTerms.sort((a, b) => b.length - a.length).join("|")})`, "u");
const chineseTermSet = new Set<string>(chineseTerms);

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(value: unknown): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  const tokens: string[] = [];
  for (const part of normalized.split(" ").flatMap((word) => word.split(chineseTermPattern)).filter(Boolean)) {
    if (chineseTermSet.has(part) || !segmenter || !/\p{Script=Han}/u.test(part)) {
      tokens.push(part);
      continue;
    }
    const segmented = [...segmenter.segment(part)]
      .filter((item) => item.isWordLike)
      .map((item) => normalizeSearchText(item.segment))
      .filter(Boolean);
    tokens.push(...(segmented.length > 0 ? segmented : [part]));
  }
  const meaningful = tokens.filter(
    (token) => !STOP_WORDS.has(token) && !(/^\p{Script=Han}$/u.test(token))
  );
  return [...new Set(meaningful.length > 0 ? meaningful : tokens)];
}

function isOneEditAway(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const differences: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    return differences.length === 2 &&
      differences[1] === differences[0] + 1 &&
      left[differences[0]] === right[differences[1]] &&
      left[differences[1]] === right[differences[0]];
  }
  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex++;
      longIndex++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      longIndex++;
    }
  }
  return true;
}

function alternativesFor(token: string): readonly string[] {
  return SYNONYM_GROUPS.find((group) => (group as readonly string[]).includes(token)) ?? [token];
}

interface PreparedField {
  value: string;
  words: string[];
  wordSet: Set<string>;
  weight: number;
}

const preparedEntries = new WeakMap<RankingEntry, { raw: unknown[]; fields: PreparedField[] }>();
const FIELD_WEIGHTS = [120, 95, 70, 68, 58, 42, 25, 18];

function prepareFields(entry: RankingEntry): PreparedField[] {
  const raw = [entry.name, entry.fullName, entry.owner ?? entry.fullName?.split("/")[0],
    (entry.tags ?? []).join(" "), (entry.topics ?? []).join(" "),
    entry.descriptionZh, entry.description, entry.type];
  const cached = preparedEntries.get(entry);
  if (cached && raw.every((value, index) => value === cached.raw[index])) return cached.fields;
  const fields = raw.map((rawValue, index) => {
    const value = normalizeSearchText(rawValue);
    const words = value.split(" ");
    return { value, words, wordSet: new Set(words), weight: FIELD_WEIGHTS[index] };
  });
  // Weak keys release old snapshots; checking source fields also handles enrichment
  // and in-place tag changes without stale search matches.
  preparedEntries.set(entry, { raw, fields });
  return fields;
}

function scoreField({ value, words, wordSet, weight }: PreparedField, token: string): number {
  if (!value) return 0;
  if (value === token) return weight * 1.8;
  if (wordSet.has(token)) return weight;
  if (words.some((word) => word.startsWith(token))) return weight * 0.82;
  if (value.includes(token)) return weight * 0.64;
  if (
    /^[a-z0-9]+$/.test(token) &&
    token.length >= 5 &&
    words.some((word) => /^[a-z0-9]+$/.test(word) && isOneEditAway(token, word))
  ) {
    return weight * 0.42;
  }
  return 0;
}

/** Compile the query once per list, then reuse normalized entry fields across searches. */
export function createSearchScorer(query: string): (entry: RankingEntry) => number | null {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return () => 0;
  const expanded = tokens.map((token) => ({ token, alternatives: alternativesFor(token) }));
  const phrase = normalizeSearchText(query);
  const requiredMatches = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.7);
  return (entry) => {
    const fields = prepareFields(entry);
    let score = 0;
    let matchedTokens = 0;
    for (const { token, alternatives } of expanded) {
      let best = 0;
      for (const alternative of alternatives) {
        const expansionPenalty = alternative === token ? 1 : 0.86;
        for (const field of fields) {
          best = Math.max(best, scoreField(field, alternative) * expansionPenalty);
        }
      }
      if (best > 0) {
        matchedTokens++;
        score += best;
      }
    }

    if (matchedTokens < requiredMatches) return null;
    const coverage = matchedTokens / tokens.length;
    score *= coverage * coverage;

    const normalizedName = fields[0].value;
    const normalizedFullName = fields[1].value;
    if (normalizedName === phrase) score += 240;
    else if (normalizedName.startsWith(phrase)) score += 150;
    if (normalizedFullName === phrase) score += 180;
    else if (normalizedFullName.includes(phrase)) score += 90;
    if (fields[5].value.includes(phrase)) score += 35;
    return score;
  };
}

export function scoreSearchEntry(entry: RankingEntry, query: string): number | null {
  return createSearchScorer(query)(entry);
}

export function matchesSearchQuery(entry: RankingEntry, query: string): boolean {
  return scoreSearchEntry(entry, query) !== null;
}
