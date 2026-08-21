/**
 * 整合包（pack）收录通道
 *
 * v0.1（2026-08-16）：宽松收录——有 dsh.pack.json / pack.json / *.pack.json 清单
 * 即视为整合包候选，检测通过即收录（无 stars 门槛，与插件通道同原则）。
 *
 * 流程：候选池（GitHub 搜索 + 已知白名单）→ 清单检测 → 条目解析校验
 * （owner/repo → GitHub、npm 包 → registry、市场内匹配）→ 评分 → DshPack
 *
 * 协议对齐：dsh.pack.json 格式遵循 docs/plans/2026-08-15-dsh-pack-design.md
 * （schemaVersion/kind/name/description/author/plugins[{id,type,version}]/config/ext），
 * 未知字段忽略、未知条目类型警告跳过——与协议前向兼容铁律一致。
 */

import type { DshPack, PackEntry, PackEntryType, PracticalScore } from "@dsh-top100/schema";
import {
  cached,
} from "./cache.js";
import {
  githubFetch,
  fetchFileViaApi,
  sleep,
  type GithubRepo,
  type GithubSearchResult,
} from "./github.js";
import { computePracticalScore } from "./scoring.js";
import { summarizeReadme } from "./summary.js";
import { runPool } from "./pool.js";
import { extractRepoFromText } from "./sources/issues.js";

/** 清单文件名（按优先级） */
const PACK_MANIFEST_FILES = ["dsh.pack.json", "pack.json"];
/** 兜底：任意 *.pack.json（如 agent.pack.json） */
const PACK_MANIFEST_GLOB_RE = /^[\w.-]+\.pack\.json$/i;

/** 调研发现的已知整合包项目（2026-08-16），作为搜索的补充候选（仍需通过检测） */
export const KNOWN_PACKS: string[] = [
  "Dariandai/dsh-starter-pack",
  "sakikoTGW/pack-agent",
  "zhangshiwei159-hue/dsh-pack",
  "mengyaoi/dsh-mcp-pack",
  "jeremy9682/dsh-skill-pack",
  "PerryLink/dsh-skill-pack-security",
  "h565656445/dsh-presets-pack",
  "h565656445/dsh-skills-pack",
  "yehuioc/dsh-memory-pack",
  "MkaliezZ/dsh-context-pack",
  "dkqfly/dsh-soul-pack",
  "xiaoxingdelabi1/dsh-profile-pack",
  "condaThinker/dsh-profile-pack",
  "RoyougiShiki/dsh-PackageManager",
  "w2112515/dsh-essentials-pack",
  "RoyDevCh/roycode-dsh-pack",
  "Edge-Echo/dsh-mcp-bridge",
  "tzy168/dsh-web-theme-packs",
  "math-lrz/dsh-theme-pack",
];

/** 搜索词（多路，Search API 单查询上限 1000；每页 2.3s 防限流） */
const PACK_QUERIES = [
  '"dsh.pack.json" in:readme',
  "dsh-pack in:name",
  "dsh-starter-pack in:name,description,readme",
  "topic:dsh-plugin pack in:name,description",
  "topic:dsh-plugin modpack",
];

/** 生态相关过滤：DSH 生态候选必须与 deepseek-harness/dsh 语境相关（砍搜索噪音） */
function isDshRelated(repo: GithubRepo): boolean {
  if (/dsh|deepseek/i.test(repo.name)) return true;
  const text = `${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
  return /dsh|deepseek|harness|agent pack|modpack|整合包/i.test(text);
}

/** 扫描整合包候选池（搜索 + 白名单，返回去重后的候选） */
export async function scanPackCandidates(): Promise<GithubRepo[]> {
  const seen = new Set<string>();
  const out: GithubRepo[] = [];
  const add = (r: GithubRepo) => {
    if (r.fork || r.archived) return;
    if (seen.has(r.full_name)) return;
    seen.add(r.full_name);
    out.push(r);
  };

  for (const q of PACK_QUERIES) {
    const url = `/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=50&page=1`;
    try {
      const res = await githubFetch<GithubSearchResult>(url);
      for (const r of res.items) {
        if (isDshRelated(r)) add(r);
      }
      console.log(`  pack-search "${q.slice(0, 40)}" -> ${res.items.length} hits, ${out.length} kept`);
    } catch (err) {
      console.warn(`  pack-search failed (${q}): ${(err as Error).message}`);
    }
    await sleep(2300); // Search API 限流 30/min
  }

  // 白名单补充（防搜索漏网，不做生态过滤——名单是人工确认的）
  for (const fullName of KNOWN_PACKS) {
    try {
      const repo = await cached<GithubRepo>("repos", fullName, () =>
        githubFetch<GithubRepo>(`/repos/${fullName}`)
      );
      add(repo);
    } catch {
      /* 仓库不存在/已删除则跳过 */
    }
  }
  return out;
}

/** 解析后的包清单 */
export interface PackManifest {
  schemaVersion: number;
  kind: string | null;
  name: string;
  description: string;
  author: string;
  entries: PackEntry[];
  /** 清单文件名（dsh.pack.json / pack.json / xxx.pack.json） */
  manifestFile: string;
  warnings: string[];
}

/** 解析并宽松校验清单内容（未知字段忽略、未知条目类型警告跳过） */
export function parsePackManifest(
  content: string,
  manifestFile: string
): PackManifest | null {
  const warnings: string[] = [];
  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch {
    return null; // 非 JSON，不是清单
  }
  if (typeof raw !== "object" || raw === null || !Array.isArray(raw.plugins)) {
    return null; // 无 plugins 数组 → 不是整合包清单
  }

  const entries: PackEntry[] = [];
  const validTypes = new Set<PackEntryType>(["skill", "cordis", "bundle", "pack"]);
  for (const item of raw.plugins) {
    if (typeof item !== "object" || item === null || typeof item.id !== "string" || !item.id) {
      warnings.push("条目缺 id，跳过");
      continue;
    }
    const type: PackEntryType = validTypes.has(item.type)
      ? item.type
      : /^[^/]+$/.test(item.id)
        ? "cordis" // 无 "/" 的裸 id 默认按 npm 包处理
        : "skill"; // 有 "/" 的默认按 owner/repo 处理
    if (item.type && !validTypes.has(item.type)) {
      warnings.push(`未知条目类型 ${item.type}（按 ${type} 处理）`);
    }
    entries.push({
      id: item.id,
      type,
      version: typeof item.version === "string" && item.version ? item.version : "latest",
    });
  }

  return {
    schemaVersion:
      typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1,
    kind: typeof raw.kind === "string" ? raw.kind : null,
    name: typeof raw.name === "string" && raw.name ? raw.name : manifestFile,
    description: typeof raw.description === "string" ? raw.description : "",
    author: typeof raw.author === "string" ? raw.author : "",
    entries,
    manifestFile,
    warnings,
  };
}

/** 宽松收录的 README 信号（无清单文件时的"包特征"关键词） */
const LOOSE_PACK_RE =
  /整合包|skill pack|skill-pack|plugin pack|plugin-pack|mcp pack|mcp-pack|starter pack|starter-pack|preset pack|preset-pack|一键装|批量安装|一键安装全部|打包合集|复刻.*环境|modpack/i;

/** 检测仓库是否为整合包：
 *  1. 根目录清单文件（dsh.pack.json / pack.json / *.pack.json）→ 协议路径
 *  2. 无清单但 README 含"包特征"信号 → 宽松收录（条目从 README 仓库链接提取） */
export async function detectPack(
  fullName: string,
  rootItemNames: string[],
  fetchFile: (path: string) => Promise<{ content: string; sha: string } | null>,
  readmeContent: string | null
): Promise<{ manifest: PackManifest; file: string } | null> {
  // 1. 精确文件名优先
  for (const name of PACK_MANIFEST_FILES) {
    if (!rootItemNames.includes(name)) continue;
    const f = await fetchFile(name);
    if (!f) continue;
    const manifest = parsePackManifest(f.content, name);
    if (manifest) return { manifest, file: name };
  }
  // 2. *.pack.json 兜底（agent.pack.json 等）
  const glob = rootItemNames.find((n) => PACK_MANIFEST_GLOB_RE.test(n));
  if (glob) {
    const f = await fetchFile(glob);
    if (f) {
      const manifest = parsePackManifest(f.content, glob);
      if (manifest) return { manifest, file: glob };
    }
  }
  // 3. 宽松路径：README 含"整合包"信号 → README 中的仓库链接作为条目
  if (readmeContent && LOOSE_PACK_RE.test(readmeContent)) {
    const repoLinks = extractRepoFromText(readmeContent);
    if (repoLinks.length > 0) {
      const manifest: PackManifest = {
        schemaVersion: 1,
        kind: "loose-pack",
        name: fullName.split("/")[1] ?? fullName,
        description: readmeContent.slice(0, 200),
        author: fullName.split("/")[0] ?? "",
        entries: repoLinks.map((id) => ({ id, type: "skill", version: "latest" })),
        manifestFile: "README.md（宽松信号）",
        warnings: ["无清单文件，条目从 README 提取（宽松收录）"],
      };
      return { manifest, file: "README.md" };
    }
  }
  return null;
}

/** 解析单个条目：GitHub repo / npm 包 / 市场内匹配 */
async function resolveEntry(
  entry: PackEntry,
  marketIds: Set<string>
): Promise<PackEntry["resolved"]> {
  const id = entry.id;
  const isRepo = id.includes("/") && /^[\w.-]+\/[\w.-]+$/.test(id);

  let exists = false;
  let reason: string | undefined;
  if (isRepo) {
    try {
      const repo = await cached<GithubRepo | null>(
        "repos",
        id.toLowerCase(),
        async () => {
          try {
            return await githubFetch<GithubRepo>(`/repos/${id}`);
          } catch {
            return null;
          }
        },
        24 * 3600_000
      );
      exists = repo !== null && !repo.fork;
      if (repo === null) reason = "GitHub 仓库不存在";
      else if (repo.fork) reason = "fork 仓库";
    } catch {
      reason = "GitHub 校验失败";
    }
  } else {
    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(10000),
      });
      exists = res.ok;
      if (!res.ok) reason = "npm 包不存在";
    } catch {
      reason = "npm 校验失败";
    }
  }

  const key = id.toLowerCase();
  const inMarket = marketIds.has(key);
  const matchId = inMarket ? key : undefined;

  return { ok: exists, inMarket, matchId, reason: exists ? undefined : reason };
}

/** 解析包内全部条目 */
export async function resolvePackEntries(
  entries: PackEntry[],
  marketIds: Set<string>
): Promise<PackEntry[]> {
  return Promise.all(
    entries.map(async (e) => ({
      ...e,
      resolved: await resolveEntry(e, marketIds),
    }))
  );
}

/** 包维度评分：复用五维评分器（repo 输入）+ 包维度解释层 */
export function scorePack(
  repo: GithubRepo,
  entries: PackEntry[],
  readmeContent: string | null,
  p99Stars: number
): PracticalScore {
  const stats = entries.reduce(
    (acc, e) => {
      if (e.resolved?.ok) acc.ok++;
      else acc.failed++;
      if (e.resolved?.inMarket) acc.inMarket++;
      return acc;
    },
    { total: entries.length, ok: 0, failed: 0, inMarket: 0 }
  );
  const score = computePracticalScore(
    {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      pushedAt: repo.pushed_at,
      hasDescription: Boolean(repo.description),
      hasLicense: Boolean(repo.license),
      hasHomepage: Boolean(repo.homepage),
      topics: repo.topics,
      readmeContent,
      hasSkillMd: false,
      needsConfig: false,
    },
    p99Stars
  );
  const resolveRate = stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : 0;
  score.explanation = `包内含 ${stats.total} 个条目，${stats.ok} 个可解析（${resolveRate}%），${stats.inMarket} 个已在市场收录；${score.explanation}`;
  return score;
}

/** 组装 DshPack */
export function buildPack(
  repo: GithubRepo,
  manifest: PackManifest,
  entries: PackEntry[],
  readmeContent: string | null,
  sources: string[],
  p99Stars: number
): DshPack {
  const stats = entries.reduce(
    (acc, e) => {
      if (e.resolved?.ok) acc.ok++;
      else acc.failed++;
      if (e.resolved?.inMarket) acc.inMarket++;
      return acc;
    },
    { total: entries.length, ok: 0, failed: 0, inMarket: 0 }
  );
  const tags = new Set<string>([...repo.topics, "整合包"]);
  // 从条目构成推断标签
  const typeCount = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});
  if (typeCount.skill === entries.length && entries.length > 0) tags.add("skill 包");
  if (typeCount.cordis === entries.length && entries.length > 0) tags.add("插件包");
  if (typeCount.bundle === entries.length && entries.length > 0) tags.add("bundle 包");

  return {
    id: repo.full_name,
    name: manifest.name,
    description: manifest.description || repo.description || "",
    descriptionZh: null,
    author: manifest.author || repo.owner.login,
    schemaVersion: manifest.schemaVersion,
    kind: (manifest.kind as DshPack["kind"]) ?? "dsh-pack",
    entries,
    entryStats: stats,
    tags: [...tags],
    stars: repo.stargazers_count,
    curated: false,
    homepage: repo.homepage,
    license: repo.license?.spdx_id ?? null,
    pushedAt: repo.pushed_at,
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    readmeSummary: readmeContent ? summarizeReadme(readmeContent) : null,
    score: scorePack(repo, entries, readmeContent, p99Stars),
    sources,
    lastCheckedAt: new Date().toISOString(),
  };
}

/** 主流程：扫描 → 检测 → 解析 → 组装（marketPlugins 用于 inMarket 匹配）
 *  opts.skipScan=true 时跳过搜索，只用 extraCandidates + KNOWN_PACKS（快速验证/本地调试用） */
export async function collectPacks(
  marketPlugins: { id: string; fullName: string }[],
  p99Stars: number,
  extraCandidates: string[] = [],
  opts: { skipScan?: boolean } = {}
): Promise<DshPack[]> {
  console.log("[1.5/6] 扫描整合包候选...");
  const candidates = opts.skipScan
    ? []
    : await scanPackCandidates();
  // 白名单（skipScan 时作为主候选）+ 人工提交的整合包（issue [提交整合包]），并入候选池走相同检测流程
  const manual = opts.skipScan ? [...KNOWN_PACKS, ...extraCandidates] : extraCandidates;
  for (const fullName of manual) {
    if (candidates.some((c) => c.full_name.toLowerCase() === fullName.toLowerCase())) continue;
    try {
      const repo = await cached<GithubRepo>("repos", fullName, () =>
        githubFetch<GithubRepo>(`/repos/${fullName}`)
      );
      if (!repo.fork && !repo.archived) candidates.push(repo);
    } catch {
      console.warn(`  pack candidate skipped: ${fullName}`);
    }
  }
  console.log(`  pack candidates: ${candidates.length}`);

  const marketIds = new Set<string>();
  for (const p of marketPlugins) {
    marketIds.add(p.id.toLowerCase());
    if (p.fullName) marketIds.add(p.fullName.toLowerCase());
  }

  const packs: DshPack[] = [];
  const rejected: string[] = [];

  /** 单候选处理（并发池 worker；每步超时保护，挂起候选直接跳过不卡池） */
  const worker = async (repo: GithubRepo) => {
    const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
      ]);
    try {
      // 根目录文件列表（缓存 24h，与插件通道共用 roots 缓存）
      const rootList = await withTimeout(
        cached<{ name: string }[] | null>(
          "roots",
          repo.full_name,
          async () =>
            githubFetch<{ name: string }[]>(
              `/repos/${repo.full_name}/contents?ref=${repo.default_branch ?? "HEAD"}`
            ).catch(() => null),
          24 * 3600_000
        ),
        15000,
        "roots"
      );
      const names = (rootList ?? []).map((i) => i.name);

      // README（宽松信号检测 + 摘要 + 评分用；先抓再检测）
      const readme = await withTimeout(
        cached<string | null>(
          "readmes",
          repo.full_name,
          async () => {
            const res = await fetch(
              `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch ?? "HEAD"}/README.md`,
              { headers: { "User-Agent": "dsh-market-collector" }, signal: AbortSignal.timeout(15000) }
            );
            return res.ok ? await res.text() : null;
          },
          24 * 3600_000
        ),
        30000,
        "readme"
      );

      const detected = await withTimeout(
        detectPack(repo.full_name, names, (path) =>
          withTimeout(fetchFileViaApi(repo.full_name, path), 15000, `fetch ${path}`)
        , readme),
        60000,
        "detect"
      );
      if (!detected) {
        rejected.push(`${repo.full_name}（无清单文件且无包信号）`);
        return;
      }

      const resolvedEntries = await withTimeout(
        resolvePackEntries(detected.manifest.entries, marketIds),
        120000,
        "resolve"
      );
      const pack = buildPack(repo, detected.manifest, resolvedEntries, readme, ["pack-search"], p99Stars);
      packs.push(pack);
      console.log(
        `  ✓ ${repo.full_name}（${detected.manifest.manifestFile}，${pack.entryStats.total} 条目，${pack.entryStats.ok} 可解析）`
      );
    } catch (err) {
      rejected.push(`${repo.full_name}（${(err as Error).message.slice(0, 70)}）`);
    }
  };

  await runPool(candidates, worker, 10);
  console.log(`  packs: ${packs.length}, rejected: ${rejected.length}`);
  if (rejected.length > 0) {
    console.log(`  rejected: ${rejected.slice(0, 15).join(" | ")}`);
  }
  return packs;
}
