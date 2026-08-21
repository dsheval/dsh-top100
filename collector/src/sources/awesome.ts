/**
 * 数据源 1：人工策展 awesome 列表解析
 * 格式：`- [name](https://github.com/owner/repo) - description`
 * 分类章节：`## Category`
 */

export interface AwesomeEntry {
  fullName: string; // owner/repo
  name: string;
  url: string;
  description: string;
  category: string | null;
  source: string; // 来源仓库
}

const AWESOME_SOURCES: { owner: string; repo: string; label: string }[] = [
  { owner: "0xsline", repo: "awesome-deepseek-harness", label: "awesome-0xsline" },
  { owner: "Alex-Yanggg", repo: "awesome-DSH-plugin", label: "awesome-alex" },
];

const MARKDOWN_LINK_RE = /^\s*[-*]\s+\[([^\]]+)\]\((https?:\/\/github\.com\/([^/]+)\/([^/)\s]+)[^)]*)\)\s*[-–—:：]?\s*(.*)$/i;

export async function fetchAwesomeEntries(
  fetchRaw: (owner: string, repo: string, path: string) => Promise<string | null>
): Promise<AwesomeEntry[]> {
  const entries: AwesomeEntry[] = [];
  for (const src of AWESOME_SOURCES) {
    const readme =
      (await fetchRaw(src.owner, src.repo, "README.md")) ??
      (await fetchRaw(src.owner, src.repo, "README.en.md"));
    if (!readme) continue;

    let category: string | null = null;
    for (const line of readme.split("\n")) {
      const heading = line.match(/^##+\s+(.+)$/);
      if (heading) {
        // 跳过 TOC 类章节（无实际条目）
        const text = heading[1].trim();
        if (!/table of contents|目录|contents/i.test(text)) category = text;
        continue;
      }
      const m = line.match(MARKDOWN_LINK_RE);
      if (!m) continue;
      const [, name, url, owner, repo] = m;
      // 过滤锚点/非 github 链接（正则已限 github.com）
      if (repo.endsWith(")")) continue;
      entries.push({
        fullName: `${owner}/${repo}`,
        name: name.trim(),
        url,
        description: (m[5] ?? "").trim(),
        category,
        source: src.label,
      });
    }
  }
  return entries;
}

/** 从 awesome 条目中提取唯一的 owner/repo 集合 */
export function uniqueFullNames(entries: AwesomeEntry[]): string[] {
  return [...new Set(entries.map((e) => e.fullName))];
}
