// plugin/src/shared/search.ts
var SYNONYM_GROUPS = [
  ["\u56FE\u7247", "\u56FE\u50CF", "\u89C6\u89C9", "ocr", "image", "vision"],
  ["\u641C\u7D22", "\u68C0\u7D22", "\u67E5\u627E", "search", "retrieval"],
  ["\u6D4F\u89C8\u5668", "\u7F51\u9875", "web", "browser"],
  ["\u4EE3\u7801", "\u7F16\u7A0B", "\u5F00\u53D1", "code", "coding"],
  ["\u7EC8\u7AEF", "\u547D\u4EE4\u884C", "shell", "cli", "terminal"],
  ["\u6587\u6863", "\u77E5\u8BC6\u5E93", "document", "docs", "knowledge"],
  ["\u81EA\u52A8\u5316", "\u5DE5\u4F5C\u6D41", "automation", "workflow"],
  ["\u6D4B\u8BD5", "\u8BC4\u6D4B", "\u8BC4\u4F30", "test", "eval", "evaluation"],
  ["\u667A\u80FD\u4F53", "\u4EE3\u7406", "agent"],
  ["\u6570\u636E\u5E93", "sql", "database"],
  ["\u8BB0\u5FC6", "memory"],
  ["\u5B89\u5168", "security"],
  ["\u76D1\u63A7", "\u89C2\u6D4B", "monitoring", "observability"]
];
var STOP_WORDS = /* @__PURE__ */ new Set([
  "\u6211",
  "\u60F3",
  "\u6211\u60F3",
  "\u627E",
  "\u627E\u4E2A",
  "\u4E00\u4E2A",
  "\u4E00\u6B3E",
  "\u53EF\u4EE5",
  "\u80FD\u591F",
  "\u7528\u4E8E",
  "\u652F\u6301",
  "\u76F8\u5173",
  "\u6709\u6CA1\u6709",
  "\u5E2E\u6211",
  "\u9700\u8981",
  "\u8FD9\u4E2A",
  "\u90A3\u4E2A",
  "\u7684",
  "\u4E86",
  "\u4E00\u4E0B",
  "\u63D2\u4EF6",
  "\u5DE5\u5177",
  "\u529F\u80FD",
  "\u5904\u7406",
  "\u7BA1\u7406",
  "please",
  "find",
  "show",
  "me",
  "a",
  "an",
  "the",
  "plugin",
  "tool",
  "for",
  "with"
]);
var segmenter = "Segmenter" in Intl ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;
function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function tokenizeSearchQuery(value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  const tokens = [];
  for (const part of normalized.split(" ")) {
    if (!segmenter || !/\p{Script=Han}/u.test(part)) {
      tokens.push(part);
      continue;
    }
    const segmented = [...segmenter.segment(part)].filter((item) => item.isWordLike).map((item) => normalizeSearchText(item.segment)).filter(Boolean);
    tokens.push(...segmented.length > 0 ? segmented : [part]);
  }
  const meaningful = tokens.filter(
    (token) => !STOP_WORDS.has(token) && !/^\p{Script=Han}$/u.test(token)
  );
  return [...new Set(meaningful.length > 0 ? meaningful : tokens)];
}
function isOneEditAway(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const differences = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    return differences.length === 2 && differences[1] === differences[0] + 1 && left[differences[0]] === right[differences[1]] && left[differences[1]] === right[differences[0]];
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
function alternativesFor(token) {
  return SYNONYM_GROUPS.find((group) => group.includes(token)) ?? [token];
}
function scoreField(value, token, weight) {
  if (!value) return 0;
  if (value === token) return weight * 1.8;
  const words = value.split(" ");
  if (words.includes(token)) return weight;
  if (words.some((word) => word.startsWith(token))) return weight * 0.82;
  if (value.includes(token)) return weight * 0.64;
  if (/^[a-z0-9]+$/.test(token) && token.length >= 5 && words.some((word) => /^[a-z0-9]+$/.test(word) && isOneEditAway(token, word))) {
    return weight * 0.42;
  }
  return 0;
}
function scoreSearchEntry(entry, query) {
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
    [normalizeSearchText(entry.type), 18]
  ];
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
function matchesSearchQuery(entry, query) {
  return scoreSearchEntry(entry, query) !== null;
}
export {
  matchesSearchQuery,
  normalizeSearchText,
  scoreSearchEntry,
  tokenizeSearchQuery
};
