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
  for (const part of normalized.split(" ")) {
    if (!segmenter || !/\p{Script=Han}/u.test(part)) {
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

function scoreField(value: string, token: string, weight: number): number {
  if (!value) return 0;
  if (value === token) return weight * 1.8;
  const words = value.split(" ");
  if (words.includes(token)) return weight;
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

export function scoreSearchEntry(entry: RankingEntry, query: string): number | null {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return 0;
  const fields = [
    [normalizeSearchText(entry.name), 120],
    [normalizeSearchText(entry.fullName), 95],
    [normalizeSearchText(entry.owner), 70],
    [normalizeSearchText((entry.tags ?? []).join(" ")), 68],
    [normalizeSearchText((entry.topics ?? []).join(" ")), 58],
    [normalizeSearchText(entry.descriptionZh), 42],
    [normalizeSearchText(entry.description), 25],
    [normalizeSearchText(entry.type), 18],
  ] as const;

  let score = 0;
  let matchedTokens = 0;
  for (const token of tokens) {
    let best = 0;
    const alternatives = alternativesFor(token);
    for (const alternative of alternatives) {
      const expansionPenalty = alternative === token ? 1 : 0.86;
      for (const [field, weight] of fields) {
        best = Math.max(best, scoreField(field, alternative, weight) * expansionPenalty);
      }
    }
    if (best > 0) {
      matchedTokens++;
      score += best;
    }
  }

  const requiredMatches = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.7);
  if (matchedTokens < requiredMatches) return null;
  const coverage = matchedTokens / tokens.length;
  score *= coverage * coverage;

  const phrase = normalizeSearchText(query);
  const normalizedName = normalizeSearchText(entry.name);
  const normalizedFullName = normalizeSearchText(entry.fullName);
  if (normalizedName === phrase) score += 240;
  else if (normalizedName.startsWith(phrase)) score += 150;
  if (normalizedFullName === phrase) score += 180;
  else if (normalizedFullName.includes(phrase)) score += 90;
  if (normalizeSearchText(entry.descriptionZh).includes(phrase)) score += 35;
  return score;
}

export function matchesSearchQuery(entry: RankingEntry, query: string): boolean {
  return scoreSearchEntry(entry, query) !== null;
}
