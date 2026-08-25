/**
 * collector 主流程（v2：并发 + 缓存）
 * 扫描 → 去重合并 → 特征检测 → 元数据+README → 实用五维评分 → 输出 data/plugins.json
 *
 * 用法：npm run collect（根目录，自动加载 .env 的 GITHUB_TOKEN）
 * 输出：data/plugins.json（市场数据）、data/report.json（统计报告）
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DshPlugin, DshPack, MarketData } from "@dsh-top100/schema";
import "./env.js"; // 加载仓库根 .env（GITHUB_TOKEN）
import {
  githubFetch,
  fetchRepoRoot,
  fetchRawFile,
  fetchFileViaApi,
  type GithubRepo,
} from "./github.js";
import { fetchRepositoryUpdates } from "./github-batch.js";
import { fetchAwesomeEntries } from "./sources/awesome.js";
import { scanOrg } from "./sources/github-search.js";
import { discoverRepositories, type DiscoveryMode } from "./sources/discovery.js";
import { fetchSubmissionRepos, fetchPackSubmissionRepos } from "./sources/issues.js";
import { detectPlugin, isCordisPackageJson, detectNeedsConfig, detectSubdirBundle } from "./detect.js";
import { computePracticalScore, computeP99Stars } from "./scoring.js";
import { cached, cacheGet, cacheSet } from "./cache.js";
import { runPool } from "./pool.js";
import {
  fallbackDescriptionZh,
  isGenericDescriptionZh,
  translateWithDeepSeek,
} from "./llm.js";
import { parseInstallCommands } from "./install-parse.js";
import { normalizeTags } from "./tag-normalize.js";
import { summarizeReadme } from "./summary.js";
import { collectPacks } from "./packs.js";

/** 检测结果缓存（增量核心：repo 未变化时复用，跳过重复检测网络调用） */
interface DetectCache {
  pushedAt: string;
  detection: {
    isPlugin: boolean;
    type: import("@dsh-top100/schema").PluginType | null;
    installMethod: import("@dsh-top100/schema").InstallMethod | null;
    skillFiles: string[];
    evidence: string[];
  };
  isCordis: boolean;
  needsConfig: boolean;
  readmeSummary: string | null;
  installParsed: { commands: string[]; source: string };
  hasSkillMd: boolean;
  /** 子目录 bundle 的插件子目录路径（如 dsh-pet/），null = 常规根目录插件 */
  subdir: string | null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const CONCURRENCY = 10;
const EXCLUDED_REPOS = new Set([
  "deepseek-ai/deepseek-harness", // 官方本体，非插件
  "deepseek-ai/awesome-deepseek-harness",
]);

interface Candidate {
  repo: GithubRepo | null;
  fullName: string;
  sources: string[];
  awesomeName?: string;
  awesomeDescription?: string;
  /** 提交插件 issue 号（issue-submission 来源；收录成功后自动回复用） */
  issueNumbers?: number[];
  /** 作者自述简介（提交 issue 时提供，可选；存到 plugin.introByAuthor） */
  introByAuthor?: string;
}

interface Detected {
  candidate: Candidate;
  plugin: DshPlugin;
  repo: GithubRepo;
  readmeContent: string | null;
  hasSkillMd: boolean;
}

/** 读取上次生成的中文数据（增量：只翻译缺失的插件） */
function loadPreviousZh(): Map<string, { descriptionZh: string | null; tagsZh: string[] }> {
  try {
    const raw = readFileSync(join(DATA_DIR, "plugins.json"), "utf-8");
    const prev = JSON.parse(raw) as MarketData;
    return new Map(
      prev.plugins.map((p) => [
        p.id,
        { descriptionZh: p.descriptionZh ?? null, tagsZh: (p.tags ?? []).filter((t) => /[\u4e00-\u9fff]/.test(t)) },
      ])
    );
  } catch {
    return new Map();
  }
}

/* ===== A：持久化中文翻译缓存（跨天累积，波动回归的插件复用旧翻译，不重复翻译）===== */
import { shouldRetranslate, type ZhEntry } from "./zh-util.js";

interface ZhCache {
  updatedAt: string;
  entries: Record<string, ZhEntry>;
}
const ZH_CACHE_FILE = join(DATA_DIR, "zh-cache.json");

function loadZhCache(): Map<string, ZhEntry> {
  try {
    const raw = JSON.parse(readFileSync(ZH_CACHE_FILE, "utf-8")) as ZhCache;
    return new Map(Object.entries(raw.entries ?? {}));
  } catch {
    return new Map();
  }
}
function saveZhCache(entries: Map<string, ZhEntry>): void {
  try {
    const out: ZhCache = { updatedAt: new Date().toISOString(), entries: Object.fromEntries(entries) };
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(ZH_CACHE_FILE, JSON.stringify(out), "utf-8");
  } catch (err) {
    console.warn(`  zh-cache 保存失败: ${(err as Error).message}`);
  }
}

/* ===== B2：已收录延续性——读取上次完整插件记录（id → plugin）===== */
function loadPreviousPlugins(): Map<string, DshPlugin> {
  try {
    const raw = readFileSync(join(DATA_DIR, "plugins.json"), "utf-8");
    const prev = JSON.parse(raw) as MarketData;
    return new Map(prev.plugins.map((p) => [p.id.toLowerCase(), p]));
  } catch {
    return new Map();
  }
}

async function main() {
  if (!process.env.GITHUB_TOKEN) {
    console.error("缺少 GITHUB_TOKEN 环境变量");
    process.exit(1);
  }

  console.log("=== DSH Market collector v2 ===");
  console.log("[1/5] 扫描数据源...");

  // 1. awesome 列表（人工策展）
  const awesomeEntries = await fetchAwesomeEntries(async (o, r, p) => {
    for (const branch of ["main", "master"]) {
      const res = await fetch(
        `https://raw.githubusercontent.com/${o}/${r}/${branch}/${p}`,
        { headers: { "User-Agent": "dsh-market-collector" } }
      );
      if (res.ok) return res.text();
    }
    return null;
  });
  const awesomeByFullName = new Map(
    awesomeEntries.map((e) => [e.fullName, e])
  );
  console.log(`  awesome lists -> ${awesomeByFullName.size} entries`);

  // 2. GitHub 分片搜索 + 代码标记 + npm 补漏 + 组织
  const discoveryMode: DiscoveryMode =
    process.env.DSH_DISCOVERY_MODE === "incremental" ? "incremental" : "full";
  const configuredSince = process.env.DSH_DISCOVERY_SINCE
    ? new Date(process.env.DSH_DISCOVERY_SINCE)
    : undefined;
  if (configuredSince && Number.isNaN(configuredSince.getTime())) {
    throw new Error("DSH_DISCOVERY_SINCE must be an ISO-8601 date");
  }
  const discovery = await discoverRepositories({
    mode: discoveryMode,
    since: configuredSince,
  });
  const orgRepos = await scanOrg();

  // 2.5 提交插件 issue（人工提交的仓库，并入候选池走相同检测流程）
  // fullName(lower) -> issue 号列表（收录成功后用于自动回复）
  const issueRepos = await fetchSubmissionRepos();

  // 3. 合并去重
  const candidates = new Map<string, Candidate>();
  const addCandidate = (
    fullName: string,
    repo: GithubRepo | null,
    source: string,
    meta?: { name?: string; description?: string; issueNumbers?: number[]; introByAuthor?: string }
  ) => {
    const key = fullName.toLowerCase();
    if (EXCLUDED_REPOS.has(key)) return;
    const existing = candidates.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.repo && repo) existing.repo = repo;
      if (meta?.issueNumbers) {
        existing.issueNumbers = [
          ...new Set([...(existing.issueNumbers ?? []), ...meta.issueNumbers]),
        ];
      }
      return;
    }
    candidates.set(key, {
      repo,
      fullName,
      sources: [source],
      awesomeName: meta?.name,
      awesomeDescription: meta?.description,
      issueNumbers: meta?.issueNumbers,
      introByAuthor: meta?.introByAuthor,
    });
  };
  for (const fn of awesomeByFullName.keys()) {
    const e = awesomeByFullName.get(fn)!;
    addCandidate(fn, null, e.source, { name: e.name, description: e.description });
  }
  for (const candidate of discovery.candidates) {
    for (const source of candidate.sources) {
      addCandidate(candidate.fullName, candidate.repo, source);
    }
  }
  for (const r of orgRepos) addCandidate(r.full_name, r, "org");
  for (const [fn, meta] of issueRepos) {
    addCandidate(fn, null, "issue-submission", {
      issueNumbers: meta.issueNumbers,
      introByAuthor: meta.introByAuthor,
    });
  }

  const all = [...candidates.values()];
  console.log(`  candidates: ${all.length}`);

  console.log("[2/5] 特征检测 + 元数据抓取（并发 10，带缓存）...");
  const detected: Detected[] = [];
  const rejected: { fullName: string; reason: string }[] = [];

  await runPool(all, async (candidate) => {
    try {
      // repo 元数据（缓存 24h）
      let repo = candidate.repo;
      if (!repo) {
        repo = await cached<GithubRepo>("repos", candidate.fullName, () =>
          githubFetch<GithubRepo>(`/repos/${candidate.fullName}`)
        );
        if (repo.fork || repo.archived) {
          rejected.push({ fullName: candidate.fullName, reason: "fork/archived" });
          return;
        }
      }

      // ===== 检测结果缓存（增量核心）：repo 未变化则复用，跳过全部检测网络调用 =====
      const DETECT_TTL = 7 * 24 * 3600_000;
      const cachedDetect = cacheGet<DetectCache>("detect", candidate.fullName, DETECT_TTL);
      let detection: Awaited<ReturnType<typeof detectPlugin>>;
      let isCordis: boolean;
      let needsConfig: boolean;
      let readmeSummary: string | null;
      let installParsed: { commands: string[]; source: string };
      let hasSkillMd: boolean;
      let readmeContent: string | null;
      let subdir: string | null = null;

      if (cachedDetect && cachedDetect.pushedAt === repo.pushed_at) {
        // 命中：仓库未变化，直接复用检测产物（零网络调用）
        detection = cachedDetect.detection;
        isCordis = cachedDetect.isCordis;
        needsConfig = cachedDetect.needsConfig;
        readmeSummary = cachedDetect.readmeSummary;
        installParsed = cachedDetect.installParsed;
        hasSkillMd = cachedDetect.hasSkillMd;
        subdir = cachedDetect.subdir ?? null;
        readmeContent = null; // 评分用：下面从 readmes 缓存取（24h 内必有）
        if (!detection.isPlugin) {
          rejected.push({ fullName: candidate.fullName, reason: "no plugin markers (cached)" });
          return;
        }
      } else {
        // 未命中/仓库变化：完整检测流程
        // 根目录文件列表（缓存 24h）
        const rootItems = await cached(
          "roots",
          candidate.fullName,
          () => fetchRepoRoot(repo!.full_name, repo!.default_branch)
        );

        // 特征检测（只基于文件列表）
        detection = await detectPlugin(candidate.fullName, rootItems);
        if (!detection.isPlugin) {
          // 子目录 bundle 探测：根目录无标记时，检查子目录内的插件成品（如 dsh-pet/）
          const sub = await detectSubdirBundle(
            candidate.fullName,
            rootItems,
            repo!.default_branch
          );
          if (sub) {
            detection = {
              isPlugin: true,
              type: "cordis-plugin",
              installMethod: "pnpm-profile",
              skillFiles: [],
              evidence: sub.evidence,
            };
            subdir = sub.subdir;
          } else {
            rejected.push({ fullName: candidate.fullName, reason: "no plugin markers" });
            return;
          }
        }

        // package.json 二次确认（子目录 bundle 时读子目录内的 package.json）
        let packageJsonContent: string | null = null;
        const pkgRel = subdir ? `${subdir}/package.json` : "package.json";
        const hasPkgJson =
          rootItems.some((i) => i.name.toLowerCase() === "package.json") || Boolean(subdir);
        if (hasPkgJson) {
          packageJsonContent = await cached<string | null>(
            "pkgjson",
            candidate.fullName + (subdir ? `:${subdir}` : ""),
            async () => {
              const f = await fetchFileViaApi(candidate.fullName, pkgRel);
              return f?.content ?? null;
            }
          );
        }
        isCordis = isCordisPackageJson(packageJsonContent);
        if (detection.type === "cordis-plugin" && !isCordis) {
          rejected.push({ fullName: candidate.fullName, reason: "package.json not cordis" });
          return;
        }

        // README（缓存 24h）
        readmeContent = await cached<string | null>(
          "readmes",
          candidate.fullName,
          () => fetchRawFile(candidate.fullName, "README.md", repo!.default_branch)
        );

        // skill 型：抓 SKILL.md 做摘要
        let skillMd: string | null = null;
        if (detection.skillFiles.length > 0) {
          skillMd = await cached<string | null>(
            "skills",
            `${candidate.fullName}:${detection.skillFiles[0]}`,
            () =>
              fetchRawFile(
                candidate.fullName,
                detection.skillFiles[0],
                repo!.default_branch
              )
          );
        }

        needsConfig = detectNeedsConfig(readmeContent);
        readmeSummary = readmeContent
          ? summarizeReadme(readmeContent)
          : skillMd
            ? summarizeReadme(skillMd)
            : null;
        installParsed = parseInstallCommands(readmeContent);
        hasSkillMd = detection.skillFiles.length > 0;

        // 写入检测缓存（含派生产物）
        cacheSet<DetectCache>("detect", candidate.fullName, {
          pushedAt: repo.pushed_at,
          detection,
          isCordis,
          needsConfig,
          readmeSummary,
          installParsed,
          hasSkillMd,
          subdir,
        });
      }

      // 评分用的 readmeContent：检测缓存命中时从 readmes 缓存补取（不重新抓取）
      if (readmeContent === null) {
        readmeContent = cacheGet<string | null>("readmes", candidate.fullName, 24 * 3600_000);
      }

      const installCommands =
        installParsed.commands.length > 0 ? installParsed.commands : undefined;
      const installMethod = detection.installMethod!;

      const plugin: DshPlugin = {
        id: repo!.full_name,
        type: detection.type!,
        name: candidate.awesomeName ?? repo!.name,
        owner: repo!.owner.login,
        repo: repo!.name,
        fullName: repo!.full_name,
        stars: repo!.stargazers_count,
        forks: repo!.forks_count,
        openIssues: repo!.open_issues_count,
        language: repo!.language,
        description: candidate.awesomeDescription ?? repo!.description ?? "",
        descriptionZh: null, // M3: DeepSeek 生成
        tags: [...repo!.topics],
        curated: false,
        homepage: repo!.homepage,
        license: repo!.license?.spdx_id ?? null,
        topics: repo!.topics,
        pushedAt: repo!.pushed_at,
        createdAt: repo!.created_at,
        updatedAt: repo!.updated_at,
        readmeSummary,
        introByAuthor: candidate.introByAuthor,
        submissionIssue: candidate.issueNumbers?.[0],
        install: {
          method: installMethod,
          target: detection.type === "skill" ? "~/.agents/skills" : undefined,
          needsConfig,
          commands: installCommands,
          commandSource: installParsed.source === "template" ? undefined : installParsed.source,
        },
        score: undefined as unknown as DshPlugin["score"],
        sources: candidate.sources,
        lastCheckedAt: new Date().toISOString(),
      };
      detected.push({
        candidate,
        plugin,
        repo: repo!,
        readmeContent,
        hasSkillMd: detection.skillFiles.length > 0,
      });
    } catch (err) {
      rejected.push({
        fullName: candidate.fullName,
        reason: `error: ${(err as Error).message.slice(0, 80)}`,
      });
    }
  });

  console.log(`  detected: ${detected.length}, rejected: ${rejected.length}`);

  // 去重：GitHub 仓库转移会让同一仓库从多个旧路径进入，full_name 归一化后 id 相同
  {
    const byId = new Map<string, Detected>();
    for (const d of detected) {
      const existing = byId.get(d.plugin.id);
      if (existing) {
        for (const s of d.plugin.sources) {
          if (!existing.plugin.sources.includes(s)) existing.plugin.sources.push(s);
        }
        continue;
      }
      byId.set(d.plugin.id, d);
    }
    const deduped = [...byId.values()];
    if (deduped.length !== detected.length) {
      console.log(`  dedup: ${detected.length} -> ${deduped.length} (repo transfers)`);
    }
    detected.length = 0;
    detected.push(...deduped);
  }

  // [B2] 已收录延续性：上次收录但本次未扫描到的仓库，repos API 单独确认后补回
  // （防「三路前 1000」边界抖动导致已收录插件消失；404 确认真删除才移除）
  const prevPlugins = loadPreviousPlugins();
  const currentIds = new Set(detected.map((d) => d.plugin.id.toLowerCase()));
  const missing = [...prevPlugins.keys()].filter((id) => !currentIds.has(id));
  let restored = 0;
  let filteredOut = 0;
  let unresolved = 0;
  if (missing.length > 0) {
    console.log(
      `  [B2] 上次收录 ${prevPlugins.size}，本次扫描未出现 ${missing.length}，GraphQL 批量刷新中...`
    );
    const updates = await fetchRepositoryUpdates(missing, {
      batchSize: 25,
      onProgress: (completed, total) => {
        if (completed === total || completed % 250 === 0) {
          console.log(`    [B2] 已刷新 ${completed}/${total}`);
        }
      },
    });
    for (const id of missing) {
      const prev = prevPlugins.get(id)!;
      const update = updates.get(id);
      if (update?.fork || update?.archived) {
        filteredOut++;
        continue;
      }
      if (!update) unresolved++;
      const canonicalFullName = update?.fullName ?? prev.fullName;
      const canonicalId = canonicalFullName.toLowerCase();
      if (canonicalId !== id && currentIds.has(canonicalId)) {
        continue;
      }
      const [owner, repoName] = canonicalFullName.split("/", 2);
      const repo: GithubRepo = {
        id: 0,
        full_name: canonicalFullName,
        name: repoName ?? prev.repo,
        owner: { login: owner ?? prev.owner },
        description: prev.description,
        stargazers_count: update?.stars ?? prev.stars,
        forks_count: update?.forks ?? prev.forks,
        open_issues_count: update?.openIssues ?? prev.openIssues,
        language: prev.language,
        homepage: prev.homepage,
        license: prev.license ? { spdx_id: prev.license } : null,
        topics: prev.topics,
        pushed_at: update?.pushedAt ?? prev.pushedAt,
        created_at: prev.createdAt,
        updated_at: update?.updatedAt ?? prev.updatedAt,
        default_branch: null,
        archived: false,
        fork: false,
      };
      detected.push({
        candidate: { fullName: canonicalFullName, repo, sources: ["restore"] },
        plugin: {
          ...prev,
          id: canonicalId,
          fullName: canonicalFullName,
          owner: owner ?? prev.owner,
          repo: repoName ?? prev.repo,
          stars: update?.stars ?? prev.stars,
          forks: update?.forks ?? prev.forks,
          openIssues: update?.openIssues ?? prev.openIssues,
          pushedAt: update?.pushedAt ?? prev.pushedAt,
          updatedAt: update?.updatedAt ?? prev.updatedAt,
          lastCheckedAt: new Date().toISOString(),
        },
        repo,
        readmeContent: null,
        hasSkillMd: false,
      });
      currentIds.add(canonicalId);
      restored++;
    }
    console.log(`  [B2] 补回 ${restored}，过滤 fork/归档 ${filteredOut}，刷新失败保留 ${unresolved}`);
  }

  console.log("[3/5] 实用五维评分...");
  const p99 = computeP99Stars(detected.map((d) => d.repo.stargazers_count));
  for (const d of detected) {
    if (d.candidate.sources.includes("restore")) continue; // B2 补回项保留上次评分（readme 未重抓，避免分数失真）
    d.plugin.score = computePracticalScore(
      {
        stars: d.repo.stargazers_count,
        forks: d.repo.forks_count,
        openIssues: d.repo.open_issues_count,
        pushedAt: d.repo.pushed_at,
        hasDescription: Boolean(d.repo.description),
        hasLicense: Boolean(d.repo.license),
        hasHomepage: Boolean(d.repo.homepage),
        topics: d.repo.topics,
        readmeContent: d.readmeContent,
        hasSkillMd: d.hasSkillMd,
        needsConfig: d.plugin.install.needsConfig,
      },
      p99
    );
  }
  console.log(`  p99 stars = ${p99}`);

  console.log("[3.5/5] 中文化（DeepSeek 增量翻译）...");
  const prevZh = loadPreviousZh();
  // A：持久化翻译缓存——跨天累积；首次/缺 cache 时从上次 plugins.json 播种
  const zhCache = loadZhCache();
  for (const [id, v] of prevZh) {
    if (!zhCache.has(id) && v.descriptionZh && !isGenericDescriptionZh(v.descriptionZh)) {
      zhCache.set(id, { descriptionZh: v.descriptionZh, tagsZh: v.tagsZh });
    }
  }
  for (const d of detected) {
    if (isGenericDescriptionZh(d.plugin.descriptionZh)) d.plugin.descriptionZh = null;
    const cached = zhCache.get(d.plugin.id);
    if (cached && isGenericDescriptionZh(cached.descriptionZh)) zhCache.delete(d.plugin.id);
  }
  let translated = 0;
  let skipped = 0;
  let retranslated = 0;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  const summaryBatchSize = Number(process.env.DEEPSEEK_SUMMARY_BATCH_SIZE ?? "300");
  const summaryConcurrency = Number(process.env.DEEPSEEK_SUMMARY_CONCURRENCY ?? "3");
  if (!Number.isInteger(summaryBatchSize) || summaryBatchSize < 0 || summaryBatchSize > 3000) {
    throw new Error("DEEPSEEK_SUMMARY_BATCH_SIZE must be an integer from 0 to 3000");
  }
  if (!Number.isInteger(summaryConcurrency) || summaryConcurrency < 1 || summaryConcurrency > 10) {
    throw new Error("DEEPSEEK_SUMMARY_CONCURRENCY must be an integer from 1 to 10");
  }

  if (apiKey) {
    // 已知标签清单（约束新翻译优先复用，抑制同义异名）：从已收录插件聚合细分中文标签 top 40
    const knownTags = [
      ...new Set(
        detected
          .filter((d) => d.plugin.descriptionZh) // 已翻译的（含复用）
          .flatMap((d) => d.plugin.tags.filter((t) => /[\u4e00-\u9fff]/.test(t)))
      ),
    ].slice(0, 40);

    const allPending = detected.filter((d) => {
      if (d.plugin.descriptionZh) return false; // 本次已有
      const cached = zhCache.get(d.plugin.id);
      if (cached?.descriptionZh) {
        // 第三步「变化量触发」：README 摘要与上次翻译时相比实质大改 → 重翻（让简介不过时）
        if (shouldRetranslate(d.plugin.readmeSummary, cached.summaryKey)) {
          retranslated++;
          return true;
        }
        // 未大改 → 复用历史翻译（含波动回归的插件——A 缓存跨天，不再被当新仓库重翻）
        d.plugin.descriptionZh = cached.descriptionZh;
        for (const t of cached.tagsZh) {
          if (!d.plugin.tags.includes(t)) d.plugin.tags.push(t);
        }
        skipped++;
        return false;
      }
      return true;
    });
    // 榜单最先展示高 Stars 项目；API 预算有限时优先保证用户可见条目的简介质量。
    allPending.sort((a, b) => b.repo.stargazers_count - a.repo.stargazers_count);
    const pending = allPending.slice(0, summaryBatchSize);
    console.log(
      `  pending translate: ${pending.length}/${allPending.length}（其中大改重翻 ${retranslated}），reused: ${skipped}`
    );

    await runPool(
      pending,
      async (d) => {
        const result = await translateWithDeepSeek(
          {
            name: d.plugin.name,
            description: d.plugin.description,
            readmeSummary: d.plugin.readmeSummary,
            topics: d.plugin.topics,
            knownTags,
          },
          { apiKey, baseURL, model }
        );
        if (result) {
          d.plugin.descriptionZh = result.descriptionZh;
          for (const t of result.tagsZh) {
            if (!d.plugin.tags.includes(t)) d.plugin.tags.push(t);
          }
          translated++;
          console.log(`    ✓ ${d.plugin.id} -> ${result.descriptionZh.slice(0, 40)}`);
        }
      },
      summaryConcurrency
    );
    console.log(
      `  translated: ${translated}, failed: ${pending.length - translated}, deferred: ${allPending.length - pending.length}`
    );
    let fallbackCount = 0;
    for (const d of detected) {
      if (!d.plugin.descriptionZh) {
        d.plugin.descriptionZh = fallbackDescriptionZh({
          name: d.plugin.name,
          description: d.plugin.description,
          readmeSummary: d.plugin.readmeSummary,
          topics: d.plugin.topics,
        });
        fallbackCount++;
      }
    }
    console.log(`  deterministic fallback: ${fallbackCount}`);
    // A：把本次全部中文简介写回持久化缓存（新翻译 + 复用 + 播种）+ 摘要指纹，跨天累积
    for (const d of detected) {
      if (d.plugin.descriptionZh && !isGenericDescriptionZh(d.plugin.descriptionZh)) {
        const prev = zhCache.get(d.plugin.id);
        zhCache.set(d.plugin.id, {
          descriptionZh: d.plugin.descriptionZh,
          tagsZh: d.plugin.tags.filter((t) => /[\u4e00-\u9fff]/.test(t)),
          summaryKey: d.plugin.readmeSummary ?? prev?.summaryKey,
        });
      } else {
        // 失败兜底只用于本次发布，不进入持久缓存，下一轮仍会优先重试。
        zhCache.delete(d.plugin.id);
      }
    }
    saveZhCache(zhCache);
  } else {
    for (const d of detected) {
      d.plugin.descriptionZh ??= fallbackDescriptionZh({
        name: d.plugin.name,
        description: d.plugin.description,
        readmeSummary: d.plugin.readmeSummary,
        topics: d.plugin.topics,
      });
    }
    console.log("  未配置 DEEPSEEK_API_KEY，复用已有简介并为缺失项生成保守中文简介");
  }

  console.log("[3.6/5] 标签归一化（合并同义词 + 移除宽泛标签）...");
  if (apiKey) {
    // 读取历史 alias（持久化复用，避免 LLM 输出波动导致合并丢失）
    let prevAlias: Record<string, string> = {};
    try {
      prevAlias = JSON.parse(readFileSync(join(DATA_DIR, "tag-alias.json"), "utf-8")).alias ?? {};
    } catch {
      prevAlias = {};
    }
    // 1) 先应用历史 alias
    const allPlugins = detected.map((d) => d.plugin);
    let histMerged = 0;
    for (const p of allPlugins) {
      const next: string[] = [];
      for (const t of p.tags) {
        const target = prevAlias[t];
        if (target && target !== t) {
          histMerged++;
          if (!next.includes(target)) next.push(target);
        } else {
          next.push(t);
        }
      }
      p.tags = next;
    }
    // 2) 再跑 LLM 归一化（针对剩余标签，含宽泛移除）
    const norm = await normalizeTags(allPlugins, { apiKey, baseURL, model });
    const aliasEntries = Object.entries(norm.alias);
    console.log(
      `  历史 alias 应用 ${histMerged} 处 · 新 LLM 合并 ${aliasEntries.length} 组（${norm.mergedCount} 处）· 移除宽泛标签 ${norm.removedGeneric} 处`
    );
    // 3) 持久化合并后的 alias
    const mergedAlias = { ...prevAlias, ...norm.alias };
    writeFileSync(
      join(DATA_DIR, "tag-alias.json"),
      JSON.stringify({ updatedAt: new Date().toISOString(), alias: mergedAlias }, null, 2),
      "utf-8"
    );
  } else {
    console.log("  跳过（无 API key）");
  }

  console.log("[3.7/5] 整合包收集...");
  // 产品决策（2026-08-16）：生态尚无标准协议与工具，自动扫描暂缓。
  // 基础设施（schema v2 / Web 分区 / 插件端 Tab / 提交 issue 通道）已就绪，
  // 设环境变量 DSH_PACK_SCAN=1 启用扫描（协议 dsh.pack.json 与 dsh-bundler 落地后默认开启）。
  const packs: DshPack[] =
    process.env.DSH_PACK_SCAN === "1"
      ? await (async () => {
          const packIssueRepos = await fetchPackSubmissionRepos();
          return collectPacks(
            detected.map((d) => ({ id: d.plugin.id, fullName: d.plugin.fullName })),
            p99,
            [...packIssueRepos.keys()]
          );
        })()
      : [];
  if (process.env.DSH_PACK_SCAN === "1") {
    console.log(`  整合包扫描已启用：${packs.length} 个`);
  } else {
    console.log("  整合包扫描暂缓（设 DSH_PACK_SCAN=1 启用；收到人工提交时见 data/packs.json 手工通道）");
  }
  // 整合包中文化（增量：复用上次结果，packs 少直接顺序翻译）
  if (apiKey && packs.length > 0) {
    let prevPacks: DshPack[] = [];
    try {
      prevPacks = JSON.parse(readFileSync(join(DATA_DIR, "packs.json"), "utf-8")).packs ?? [];
    } catch {
      prevPacks = [];
    }
    const prevZh = new Map(prevPacks.map((p) => [p.id, p.descriptionZh]));
    const knownPackTags = [
      ...new Set(packs.flatMap((p) => p.tags.filter((t) => /[\u4e00-\u9fff]/.test(t)))),
    ].slice(0, 30);
    let translated = 0;
    for (const pack of packs) {
      const prev = prevZh.get(pack.id);
      if (prev) {
        pack.descriptionZh = prev;
        continue;
      }
      const result = await translateWithDeepSeek(
        {
          name: pack.name,
          description: pack.description,
          readmeSummary: pack.readmeSummary,
          topics: pack.tags,
          knownTags: knownPackTags,
        },
        { apiKey, baseURL, model }
      );
      if (result) {
        pack.descriptionZh = result.descriptionZh;
        for (const t of result.tagsZh) {
          if (!pack.tags.includes(t)) pack.tags.push(t);
        }
        translated++;
        console.log(`    ✓ pack ${pack.id} -> ${result.descriptionZh.slice(0, 40)}`);
      }
      pack.descriptionZh ??= fallbackDescriptionZh({
        name: pack.name,
        description: pack.description,
        readmeSummary: pack.readmeSummary,
        topics: pack.tags,
      });
    }
    console.log(`  packs translated: ${translated}`);
  }

  console.log("[4/5] 生成数据文件...");
  const market: MarketData = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plugins: detected.map((d) => d.plugin),
    packs,
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "plugins.json"), JSON.stringify(market, null, 2), "utf-8");
  // 独立 packs 数据文件（Web 单独加载，schemaVersion 1）：
  // 扫描关闭时不覆盖——data/packs.json 由人工通道（scripts/pack-add.ts）维护，
  // 每日管道只负责把已提交的文件同步到 web/public 并部署。
  if (process.env.DSH_PACK_SCAN === "1") {
    writeFileSync(
      join(DATA_DIR, "packs.json"),
      JSON.stringify({ schemaVersion: 1, generatedAt: market.generatedAt, packs }, null, 2),
      "utf-8"
    );
  } else {
    console.log("  保留人工 data/packs.json（扫描关闭，不覆盖人工收录的整合包）");
  }
  writeFileSync(
    join(DATA_DIR, "report.json"),
    JSON.stringify(
      {
        generatedAt: market.generatedAt,
        discovery: discovery.audit,
        total: market.plugins.length,
        byType: market.plugins.reduce<Record<string, number>>((acc, p) => {
          acc[p.type] = (acc[p.type] ?? 0) + 1;
          return acc;
        }, {}),
        bySource: Object.entries(
          market.plugins.reduce<Record<string, number>>((acc, p) => {
            for (const s of p.sources) acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {})
        ),
        packs: packs.map((p) => ({
          id: p.id,
          entries: p.entryStats.total,
          ok: p.entryStats.ok,
          inMarket: p.entryStats.inMarket,
          score: p.score.total,
        })),
        p99Stars: p99,
        top10: [...market.plugins]
          .sort((a, b) => b.score.total - a.score.total)
          .slice(0, 10)
          .map((p) => ({
            id: p.id,
            score: p.score.total,
            stars: p.stars,
            explanation: p.score.explanation,
          })),
        rejectedCount: rejected.length,
        rejected: rejected.slice(0, 30),
      },
      null,
      2
    ),
    "utf-8"
  );

  // 提交插件 issue 自动回复清单：收录成功的 issue-submission 来源插件
  // workflow 的回复步骤读取本文件，对每个 issue 评论"已收录"并关闭
  const issueReplies = detected
    .filter((d) => d.candidate.issueNumbers?.length)
    .map((d) => ({
      issueNumbers: d.candidate.issueNumbers!,
      fullName: d.plugin.fullName,
      type: d.plugin.type,
      stars: d.plugin.stars,
      score: d.plugin.score?.total ?? null,
    }));
  if (issueReplies.length > 0) {
    writeFileSync(
      join(DATA_DIR, "issue-replies.json"),
      JSON.stringify({ generatedAt: market.generatedAt, replies: issueReplies }, null, 2),
      "utf-8"
    );
    console.log(`  issue-replies: ${issueReplies.length} 条（待 workflow 自动回复）`);
  } else {
    console.log("  issue-replies: 无（无待回复的 issue 收录）");
  }

  console.log("[5/5] 完成");
  const top5 = [...market.plugins]
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5)
    .map((p) => `${p.id}(${p.score.total})`)
    .join(", ");
  console.log(`  plugins.json: ${market.plugins.length} plugins`);
  console.log(`  top5: ${top5}`);
}

main().catch((err) => {
  console.error("collector failed:", err);
  process.exit(1);
});
