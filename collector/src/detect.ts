/**
 * 仓库特征检测：判断一个仓库是不是 DSH 插件，以及它的类型/安装方式
 *
 * 判据（按优先级）：
 * 1. 验证根目录 package.json 与 DSH/Cordis 标记；只有 package.json 不算插件证据
 * 2. 根目录验证失败后，根据 workspaces 与有限的常见目录检查子包
 * 3. 若没有 Bundle，再检查根目录或 skills/ 下的 SKILL.md
 *
 * needsConfig 需要 README 内容，由调用方在抓取 README 后单独调用 detectNeedsConfig。
 */

import type { InstallMethod, PluginType } from "@dsh-top100/schema";
import { fetchRepoRoot, fetchFileViaApi, type RepoContentItem } from "./github.js";

export interface Detection {
  isPlugin: boolean;
  type: PluginType | null;
  installMethod: InstallMethod | null;
  /** 根目录发现的 skill 清单（技能集合仓库用） */
  skillFiles: string[];
  /** 检测依据说明（供报告） */
  evidence: string[];
  /** 被选为仓库主插件的相对目录；null 表示仓库根目录。 */
  pluginPath: string | null;
  /** 被选中插件子包声明的 npm 包名。 */
  packageName: string | null;
  /** 仓库内通过验证的所有插件目录；根目录表示为 "."。 */
  pluginPaths: string[];
}

const SKILL_MARKER = "SKILL.md";
const CORDIS_MARKERS = ["dsh.profile", "cordis.patch.yml", "dsh.profile.yml"];
const MAX_SUBDIR_CANDIDATES = 12;

interface PackageMetadata {
  name: string | null;
  workspaces: string[];
}

interface BundleCandidate {
  path: string;
  packageName: string | null;
  evidence: string;
  priority: number;
}

function packageMetadata(content: string | null): PackageMetadata {
  if (!content) return { name: null, workspaces: [] };
  try {
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const rawWorkspaces = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces && typeof pkg.workspaces === "object"
        ? (pkg.workspaces as { packages?: unknown }).packages
        : [];
    const workspaces = Array.isArray(rawWorkspaces)
      ? rawWorkspaces.filter((value): value is string => typeof value === "string")
      : [];
    return {
      name: typeof pkg.name === "string" && pkg.name.trim() ? pkg.name.trim() : null,
      workspaces,
    };
  } catch {
    return { name: null, workspaces: [] };
  }
}

function safeWorkspacePath(value: string): string | null {
  const normalized = value.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) return null;
  if (!/^[A-Za-z0-9._/@*-]+$/.test(normalized)) return null;
  if (normalized.includes("*") && !normalized.endsWith("/*")) return null;
  return normalized;
}

function hasCordisMarker(items: RepoContentItem[]): boolean {
  return items.some(
    (item) => item.type === "file" && CORDIS_MARKERS.includes(item.name.toLowerCase())
  );
}

async function readPackage(
  fullName: string,
  path: string,
  branch?: string | null
): Promise<string | null> {
  const file = await fetchFileViaApi(
    fullName,
    path === "." ? "package.json" : `${path}/package.json`,
    branch
  );
  return file?.content ?? null;
}

async function subdirCandidatePaths(
  fullName: string,
  rootItems: RepoContentItem[],
  branch: string | null | undefined,
  rootPackageContent: string | null
): Promise<Array<{ path: string; priority: number }>> {
  const repoName = fullName.split("/")[1]?.toLowerCase() ?? "";
  const paths = new Map<string, number>();
  const add = (path: string, priority: number): void => {
    const normalized = safeWorkspacePath(path);
    if (!normalized || normalized.includes("*")) return;
    const current = paths.get(normalized);
    if (current === undefined || priority < current) paths.set(normalized, priority);
  };
  const rootDirs = new Map(
    rootItems
      .filter((item) => item.type === "dir")
      .map((item) => [item.path, item])
  );

  for (const item of rootDirs.values()) {
    const name = item.name.toLowerCase();
    if (name === "plugin") add(item.path, 0);
    else if (name === repoName) add(item.path, 10);
    else if (/^(dsh|cordis|plugin|bundle|client)(?:[-_]|$)/.test(name)) add(item.path, 20);
  }

  const metadata = packageMetadata(rootPackageContent);
  const containerPaths = new Map<string, number>();
  metadata.workspaces.forEach((workspace, index) => {
    const normalized = safeWorkspacePath(workspace);
    if (!normalized) return;
    if (normalized.endsWith("/*")) {
      const container = normalized.slice(0, -2);
      containerPaths.set(container, Math.min(containerPaths.get(container) ?? Number.POSITIVE_INFINITY, 30 + index));
    } else {
      add(normalized, 30 + index);
    }
  });

  for (const common of ["plugin", "plugins", "packages"]) {
    const item = [...rootDirs.values()].find((candidate) => candidate.name.toLowerCase() === common);
    if (item && (common === "plugins" || common === "packages")) {
      containerPaths.set(item.path, Math.min(containerPaths.get(item.path) ?? Number.POSITIVE_INFINITY, 80));
    }
  }

  for (const [container, priority] of containerPaths) {
    const listing = await fetchRepoRoot(fullName, branch, container);
    for (const item of listing) {
      if (item.type === "dir") add(item.path, priority);
    }
  }

  return [...paths]
    .map(([path, priority]) => ({ path, priority }))
    .sort((left, right) => left.priority - right.priority || left.path.localeCompare(right.path))
    .slice(0, MAX_SUBDIR_CANDIDATES);
}

async function detectBundleCandidates(
  fullName: string,
  rootItems: RepoContentItem[],
  branch?: string | null,
  includeRoot = true
): Promise<BundleCandidate[]> {
  const rootHasPackage = rootItems.some(
    (item) => item.type === "file" && item.name.toLowerCase() === "package.json"
  );
  const rootPackageContent = rootHasPackage ? await readPackage(fullName, ".", branch) : null;
  const candidates: BundleCandidate[] = [];

  if (includeRoot && rootHasPackage && (hasCordisMarker(rootItems) || isCordisPackageJson(rootPackageContent))) {
    candidates.push({
      path: ".",
      packageName: packageMetadata(rootPackageContent).name,
      evidence: hasCordisMarker(rootItems)
        ? "root package.json + cordis marker"
        : "root package.json contains DSH/Cordis declaration",
      priority: -1,
    });
  }

  const paths = await subdirCandidatePaths(fullName, rootItems, branch, rootPackageContent);
  for (const candidate of paths) {
    const items = await fetchRepoRoot(fullName, branch, candidate.path);
    const hasPackage = items.some(
      (item) => item.type === "file" && item.name.toLowerCase() === "package.json"
    );
    if (!hasPackage) continue;
    const content = await readPackage(fullName, candidate.path, branch);
    const marker = hasCordisMarker(items);
    if (!marker && !isCordisPackageJson(content)) continue;
    candidates.push({
      ...candidate,
      packageName: packageMetadata(content).name,
      evidence: marker
        ? `subdir ${candidate.path}/ (package.json + cordis marker)`
        : `subdir ${candidate.path}/（package.json 含 DSH 依赖或声明）`,
    });
  }
  return candidates;
}

export async function detectPlugin(
  fullName: string,
  rootItems: RepoContentItem[],
  branch?: string | null
): Promise<Detection> {
  const evidence: string[] = [];
  const skillFiles: string[] = [];
  const names = new Set(rootItems.map((i) => i.name.toLowerCase()));

  // 1. 根目录 SKILL.md
  if (names.has(SKILL_MARKER.toLowerCase())) {
    evidence.push("root SKILL.md");
    skillFiles.push(SKILL_MARKER);
  }

  // 2. skills/ 目录（仅当根目录没有 SKILL.md 时探测，节省调用）
  if (skillFiles.length === 0) {
    const skillsDir = rootItems.find(
      (i) => i.type === "dir" && /^skills?$/i.test(i.name)
    );
    if (skillsDir) {
      const subItems = await fetchRepoRoot(fullName, branch, skillsDir.path);
      const skillDocs = subItems.filter(
        (i) => i.type === "file" && i.name.toUpperCase() === "SKILL.MD"
      );
      if (skillDocs.length > 0) {
        evidence.push(`skills/ dir (${skillDocs.length} SKILL.md)`);
        skillFiles.push(...skillDocs.map((d) => d.path));
      }
    }
  }

  // package.json 只是待验证线索，不能单独作为插件证据。
  const hasPackageJson = names.has("package.json");
  if (hasPackageJson) evidence.push("has package.json");

  const bundles = await detectBundleCandidates(fullName, rootItems, branch);
  if (bundles.length > 0) {
    const selected = bundles[0];
    const pluginPaths = bundles.map((candidate) => candidate.path);
    evidence.push(...bundles.map((candidate) => candidate.evidence));
    if (bundles.length > 1) {
      evidence.push(`selected ${selected.path}/ from ${bundles.length} validated plugin packages`);
    }
    return {
      isPlugin: true,
      type: "cordis-plugin",
      installMethod: "pnpm-profile",
      skillFiles: [],
      evidence,
      pluginPath: selected.path === "." ? null : selected.path,
      packageName: selected.packageName,
      pluginPaths,
    };
  }

  const isSkill = skillFiles.length > 0;
  if (!isSkill) {
    return {
      isPlugin: false,
      type: null,
      installMethod: null,
      skillFiles: [],
      evidence,
      pluginPath: null,
      packageName: null,
      pluginPaths: [],
    };
  }

  const type: PluginType = "skill";
  const installMethod: InstallMethod = "skills-add";
  return {
    isPlugin: true,
    type,
    installMethod,
    skillFiles,
    evidence,
    pluginPath: null,
    packageName: null,
    pluginPaths: [],
  };
}

/** 子目录 bundle 探测：根目录无插件标记时，检查是否存在"子目录内含 package.json + cordis 标记"的插件成品
 * （仓库根目录放素材/文档/工具链，插件在子目录——如 PC2005-cloud/dsh-pet 的 dsh-pet/）
 * 只探测 workspace 与可信常见目录，最多 12 个，控制 API 调用。 */
export async function detectSubdirBundle(
  fullName: string,
  rootItems: RepoContentItem[],
  branch?: string | null
): Promise<{ subdir: string; evidence: string[]; packageName: string | null; pluginPaths: string[] } | null> {
  const bundles = await detectBundleCandidates(fullName, rootItems, branch, false);
  const selected = bundles[0];
  if (!selected) return null;
  return {
    subdir: selected.path,
    packageName: selected.packageName,
    pluginPaths: bundles.map((candidate) => candidate.path),
    evidence: [
      ...bundles.map((candidate) => candidate.evidence),
      ...(bundles.length > 1
        ? [`selected ${selected.path}/ from ${bundles.length} validated plugin packages`]
        : []),
    ],
  };
}

const CORDIS_PKG_KEYWORDS = [
  "cordis",
  "@cordisjs/plugin",
  "dsh-base",
  "@deepseek-ai/dsh-",
];

/** package.json 内容是否为 cordis 插件：
 * 1. 依赖含 cordis 关键字（标准 cordis 插件）
 * 2. 有 dsh.bundle.patch 字段（DSH Bundle 结构，如 Code2Skill：cordis.patch.yml + skills）
 * 3. 有 dsh.client / dshClient 字段（纯 client 注入插件：无 host 代码，只声明 client 注入，
 *    如 dsh-read-history：dsh.client.platform + inject @deepseek-ai/dsh-client-*） */
export function isCordisPackageJson(content: string | null): boolean {
  if (!content) return false;
  try {
    const pkg = JSON.parse(content);
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    if (Object.keys(deps).some((d) =>
      CORDIS_PKG_KEYWORDS.some((k) => d.includes(k))
    )) return true;
    // DSH Bundle：package.json 的 dsh.bundle.patch 字段声明 cordis patch 文件
    if (pkg.dsh && typeof pkg.dsh === "object" && pkg.dsh.bundle?.patch) return true;
    // 纯 client 注入插件：dsh.client / dshClient 声明 client 注入（platform + inject）
    if (pkg.dsh && typeof pkg.dsh === "object" && pkg.dsh.client) return true;
    if (pkg.dshClient && typeof pkg.dshClient === "object") return true;
    return false;
  } catch {
    return false;
  }
}

/** 检测 README/SKILL 内容中的"需要配置"信号（具体环境变量名） */
const CONFIG_KEY_RE =
  /(?:^|[^A-Za-z])(GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|LLM_API_KEY|API_KEY|CLAUDE_API_KEY|AZURE_OPENAI|AWS_ACCESS_KEY|STRIPE_API_KEY|WEBHOOK_SECRET|SESSION_KEY)(?:[^A-Za-z]|$)/i;

/** 否定语境（"不需要 API key"等）——命中则先摘除，避免误报 */
const NEGATION_RE =
  /(?:不需要|无需|不用|免[^。；\n]{0,10}(?:配置|token|key)|no (?:api ?key|token|config|setup|configuration)|without (?:any )?(?:api ?key|token|config)|no configuration required|zero-?config|works (?:out of the box|without))/i;

export function detectNeedsConfig(readmeContent: string | null): boolean {
  if (!readmeContent) return false;
  const text = readmeContent.replace(NEGATION_RE, " ");
  return CONFIG_KEY_RE.test(text);
}
