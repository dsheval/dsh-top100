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
import { load as loadYaml, JSON_SCHEMA } from "js-yaml";
import { fetchRepoRoot, fetchFileViaApi, type RepoContentItem } from "./github.js";

export const DISCOVERY_POLICY_VERSION = 6;
export type DiscoveryKind = "bundle" | "client" | "host" | "skill";

/** Observed structural invalidity, distinct from a temporary fetch failure. */
export class ReviewedTargetValidationError extends Error {}

export interface Detection {
  kind: DiscoveryKind | null;
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

/** A reviewed selection still needs current package and entry evidence. */
export interface ReviewedPackageTarget {
  packageName: string;
  repositoryPath: string | null;
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
  kind: DiscoveryKind;
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
  const segments = normalized.split("/");
  if (segments.length > 6 || segments.filter(part => part === "*").length > 2
    || segments.some(part => !part || part.includes("*") && part !== "*")) return null;
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
  // 调用方已看到 package.json；读取失败属于待复核，不能当作确定不是插件。
  if (!file) throw new Error(`package metadata unavailable: ${fullName}/${path}`);
  return file.content;
}

async function subdirCandidatePaths(
  fullName: string,
  rootItems: RepoContentItem[],
  branch: string | null | undefined,
  rootPackageContent: string | null
): Promise<{ paths: Array<{ path: string; priority: number }>; truncated: boolean }> {
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
  if (rootItems.some(item => item.type === "file" && item.name === "pnpm-workspace.yaml")) {
    const file = await fetchFileViaApi(fullName, "pnpm-workspace.yaml", branch);
    if (!file) throw new Error("Observed pnpm workspace could not be read");
    try {
      const workspace = record(loadYaml(file.content, { schema: JSON_SCHEMA }));
      if (Array.isArray(workspace?.packages)) metadata.workspaces.push(...workspace.packages.filter((v): v is string => typeof v === "string"));
    } catch { throw new Error("Observed pnpm workspace could not be parsed"); }
  }
  const directoryCache = new Map<string, RepoContentItem[]>();
  const listDirectory = async (directory: string) => {
    if (!directoryCache.has(directory)) {
      if (directoryCache.size >= 24) throw new Error("Workspace discovery directory budget exhausted");
      directoryCache.set(directory, await fetchRepoRoot(fullName, branch, directory));
    }
    return directoryCache.get(directory)!;
  };
  const containerPaths = new Map<string, number>();
  for (const [index, workspace] of metadata.workspaces.entries()) {
    const normalized = safeWorkspacePath(workspace);
    if (!normalized) continue;
    if (normalized.includes("*") && (!normalized.endsWith("/*") || normalized.split("/").filter(part => part === "*").length === 2)) {
      let prefixes = [""];
      for (const segment of normalized.split("/")) {
        if (segment === "*") {
          const expanded: string[] = [];
          for (const prefix of prefixes) {
            const listing = prefix ? await listDirectory(prefix) : rootItems;
            expanded.push(...listing.filter(item => item.type === "dir").map(item => item.path));
          }
          prefixes = expanded;
        } else prefixes = prefixes.map(prefix => prefix ? `${prefix}/${segment}` : segment);
      }
      for (const prefix of prefixes) add(prefix, 30 + index);
    } else if (normalized.endsWith("/*")) {
      const container = normalized.slice(0, -2);
      containerPaths.set(container, Math.min(containerPaths.get(container) ?? Number.POSITIVE_INFINITY, 30 + index));
    } else {
      add(normalized, 30 + index);
    }
  }

  for (const common of ["plugin", "plugins", "packages"]) {
    const item = [...rootDirs.values()].find((candidate) => candidate.name.toLowerCase() === common);
    if (item && (common === "plugins" || common === "packages")) {
      containerPaths.set(item.path, Math.min(containerPaths.get(item.path) ?? Number.POSITIVE_INFINITY, 80));
    }
  }

  for (const [container, priority] of containerPaths) {
    const listing = await listDirectory(container);
    for (const item of listing) {
      if (item.type === "dir") add(item.path, priority);
    }
  }

  const ordered = [...paths]
    .map(([path, priority]) => ({ path, priority }))
    .sort((left, right) => left.priority - right.priority || left.path.localeCompare(right.path));
  return { paths: ordered.slice(0, MAX_SUBDIR_CANDIDATES), truncated: ordered.length > MAX_SUBDIR_CANDIDATES };
}

async function detectBundleCandidates(
  fullName: string,
  rootItems: RepoContentItem[],
  branch?: string | null,
  includeRoot = true,
  primaryOnly = false,
): Promise<{ candidates: BundleCandidate[]; truncated: boolean }> {
  const rootHasPackage = rootItems.some(
    (item) => item.type === "file" && item.name.toLowerCase() === "package.json"
  );
  const rootPackageContent = rootHasPackage ? await readPackage(fullName, ".", branch) : null;
  const candidates: BundleCandidate[] = [];

  if (includeRoot && rootHasPackage) {
    const kind = await validatePackage(fullName, ".", rootPackageContent, rootItems, branch);
    if (kind) candidates.push({
      path: ".",
      packageName: packageMetadata(rootPackageContent).name,
      evidence: `root package.json validated ${kind} declaration and entry`,
      priority: -1,
      kind,
    });
    if (primaryOnly && candidates.length) return { candidates, truncated: false };
  }

  const { paths, truncated } = await subdirCandidatePaths(fullName, rootItems, branch, rootPackageContent);
  for (const candidate of paths) {
    const items = await fetchRepoRoot(fullName, branch, candidate.path);
    const hasPackage = items.some(
      (item) => item.type === "file" && item.name.toLowerCase() === "package.json"
    );
    if (!hasPackage) continue;
    const content = await readPackage(fullName, candidate.path, branch);
    const kind = await validatePackage(fullName, candidate.path, content, items, branch);
    if (!kind) continue;
    candidates.push({
      ...candidate,
      kind,
      packageName: packageMetadata(content).name,
      evidence: `subdir ${candidate.path}/ validated ${kind} declaration and entry`,
    });
    if (primaryOnly) return { candidates, truncated };
  }
  return { candidates, truncated };
}

function bundleDetection(bundles: BundleCandidate[], evidence: string[]): Detection {
  const selected = bundles[0];
  evidence.push(...bundles.map(candidate => candidate.evidence));
  if (bundles.length > 1) evidence.push(`selected ${selected.path}/ from ${bundles.length} validated plugin packages`);
  return { isPlugin: true, kind: selected.kind, type: "cordis-plugin", installMethod: "pnpm-profile",
    skillFiles: [], evidence, pluginPath: selected.path === "." ? null : selected.path,
    packageName: selected.packageName, pluginPaths: bundles.map(candidate => candidate.path) };
}

export async function detectPlugin(
  fullName: string,
  rootItems: RepoContentItem[],
  branch?: string | null,
  options: { primaryOnly?: boolean; reviewedTarget?: ReviewedPackageTarget } = {},
): Promise<Detection> {
  if (options.reviewedTarget) {
    const target = options.reviewedTarget;
    const path = target.repositoryPath ?? ".";
    if ((target.repositoryPath !== null && (!localEntry(path) || path.startsWith("./")
      || !/^[A-Za-z0-9._@/-]+$/.test(path)))
      || !target.packageName || target.packageName !== target.packageName.trim()) {
      throw new ReviewedTargetValidationError("Invalid reviewed package target");
    }
    const items = path === "." ? rootItems : await fetchRepoRoot(fullName, branch, path);
    if (!items.some(item => item.type === "file" && item.name === "package.json")) {
      throw new ReviewedTargetValidationError(`Reviewed package metadata missing: ${fullName}/${path}`);
    }
    const content = await readPackage(fullName, path, branch);
    if (packageMetadata(content).name !== target.packageName) {
      throw new ReviewedTargetValidationError(`Reviewed package name mismatch: ${fullName}/${path}`);
    }
    const kind = await validatePackage(fullName, path, content, items, branch);
    if (!kind) throw new ReviewedTargetValidationError(`Reviewed package declaration or entry invalid: ${fullName}/${path}`);
    return bundleDetection([{
      path, packageName: target.packageName, kind, priority: -1,
      evidence: `reviewed ${path}/ validated ${kind} declaration, package name and entry`,
    }], []);
  }
  const evidence: string[] = [];
  const skillFiles: string[] = [];
  let skillScanTruncated = false;
  const names = new Set(rootItems.filter((i) => i.type === "file").map((i) => i.name.toLowerCase()));

  // Collection consumes only the selected package. Its priority is already root
  // then sorted subpackages, so unrelated skills need not be inspected first.
  const primaryBundles = options.primaryOnly
    ? await detectBundleCandidates(fullName, rootItems, branch, true, true) : undefined;
  if (primaryBundles?.candidates.length) {
    if (names.has("package.json")) evidence.push("has package.json");
    return bundleDetection(primaryBundles.candidates, evidence);
  }

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
      skillFiles.push(...skillDocs.map((d) => d.path));
      // 标准技能集合布局 skills/<name>/SKILL.md，限制目录数与深度。
      const skillDirs = subItems.filter((i) => i.type === "dir");
      skillScanTruncated = skillDirs.length > 24;
      for (const dir of skillDirs.slice(0, 24)) {
        if (options.primaryOnly && skillFiles.length) break;
        const children = await fetchRepoRoot(fullName, branch, dir.path);
        skillFiles.push(...children.filter((i) => i.type === "file" && i.name.toUpperCase() === "SKILL.MD").map((i) => i.path));
      }
      if (options.primaryOnly && skillFiles.length > 1) skillFiles.splice(1);
      if (skillFiles.length) evidence.push(`skills directory (${skillFiles.length} SKILL.md)`);
    }
  }

  // package.json 只是待验证线索，不能单独作为插件证据。
  const hasPackageJson = names.has("package.json");
  if (hasPackageJson) evidence.push("has package.json");

  const { candidates: bundles, truncated: bundleScanTruncated } = primaryBundles
    ?? await detectBundleCandidates(fullName, rootItems, branch);
  if (bundles.length > 0) {
    return bundleDetection(bundles, evidence);
  }

  const isSkill = skillFiles.length > 0;
  if (!isSkill && (bundleScanTruncated || skillScanTruncated)) {
    throw new Error("Plugin discovery candidate budget exhausted before a conclusive result");
  }
  if (!isSkill) {
    return {
      isPlugin: false,
      kind: null,
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
    kind: "skill",
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
  const { candidates: bundles, truncated } = await detectBundleCandidates(fullName, rootItems, branch, false);
  const selected = bundles[0];
  if (!selected && truncated) throw new Error("Plugin discovery candidate budget exhausted before a conclusive result");
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function localEntry(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) return false;
  const path = value.replace(/^\.\//, "");
  return Boolean(path) && !path.startsWith("/") && !path.includes("\\") && !/[?#:*]/.test(path)
    && !path.split("/").some((part) => !part || part === "." || part === "..");
}

function exportEntry(value: unknown): boolean {
  if (typeof value === "string") return localEntry(value) && !/\.d\.[cm]?ts$/.test(value);
  const entries = record(value);
  return Boolean(entries && Object.entries(entries).some(([key, entry]) => key !== "types" && exportEntry(entry)));
}

function packageKind(pkg: Record<string, unknown>, marker = false): DiscoveryKind | null {
  if (typeof pkg.name !== "string" || !pkg.name.trim()) return null;
  const dsh = record(pkg.dsh);
  const bundle = record(dsh?.bundle);
  if (dsh && "bundle" in dsh) {
    return bundle && localEntry(bundle.patch) && /\.ya?ml$/i.test(bundle.patch) ? "bundle" : null;
  }
  const exports = record(pkg.exports);
  const client = record(dsh?.client) ?? record(pkg.dshClient);
  if ((dsh && "client" in dsh) || "dshClient" in pkg) {
    return client && typeof client.platform === "string" && client.platform.trim()
      && (client.inject === undefined || Array.isArray(client.inject) && client.inject.every((v) => typeof v === "string" && v.trim()))
      && exportEntry(exports?.["./client"]) ? "client" : null;
  }
  const hasEntry = exportEntry(pkg.main) || exportEntry(exports?.["."]) || typeof pkg.exports === "string" && exportEntry(pkg.exports);
  // 开发依赖、关键词或包名相似只能作为发现线索。
  const deps = { ...record(pkg.dependencies), ...record(pkg.peerDependencies) };
  const allDeps = { ...deps, ...record(pkg.devDependencies) };
  if (pkg.bin || allDeps.electron || allDeps["@tauri-apps/api"] || allDeps["@tauri-apps/cli"]) return null;
  const ecosystem = Object.keys(deps).some((name) =>
    /^(?:cordis|@cordisjs\/[^/]+|@deepseek-ai\/(?:cordis|dsh-[a-z0-9-]+)|dsh-base)$/.test(name));
  if (hasEntry && (marker || ecosystem)) return marker ? "bundle" : "host";
  return null;
}

/** 只验证声明结构；具体发布包能否安装仍由安装预检判断。 */
export function isCordisPackageJson(content: string | null): boolean {
  if (!content) return false;
  try { const pkg = record(JSON.parse(content)); return Boolean(pkg && packageKind(pkg)); }
  catch { return false; }
}

async function validatePackage(
  fullName: string, path: string, content: string | null,
  items: RepoContentItem[], branch?: string | null
): Promise<DiscoveryKind | null> {
  if (!content) return null;
  let pkg: Record<string, unknown> | null;
  try { pkg = record(JSON.parse(content)); } catch { return null; }
  if (!pkg) return null;
  const kind = packageKind(pkg, hasCordisMarker(items));
  if (!kind) return null;
  if (kind === "bundle") {
    const patch = record(record(pkg.dsh)?.bundle)?.patch;
    if (typeof patch === "string") {
      const relative = patch.replace(/^\.\//, "");
      if (!relative.includes("/")) {
        if (!items.some((item) => item.type === "file" && item.name === relative)) return null;
      } else {
        const directory = relative.slice(0, relative.lastIndexOf("/"));
        const name = relative.slice(relative.lastIndexOf("/") + 1);
        const children = await fetchRepoRoot(fullName, branch, path === "." ? directory : `${path}/${directory}`);
        if (!children.some((item) => item.type === "file" && item.name === name)) return null;
      }
    }
  }
  return kind;
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
