/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */

import type { InstallSpec } from "../shared/types.js";
import { npmPackageSpec } from "./install-spec.js";

const MANIFEST_TIMEOUT_MS = 15_000;
const VERIFICATION_CACHE_MS = 10 * 60 * 1000;

export class InstallVerificationError extends Error {
  fatal: boolean;
  status: number | null;

  constructor(message: string, fatal = false, status: number | null = null) {
    super(message);
    this.name = "InstallVerificationError";
    this.fatal = fatal;
    this.status = status;
  }
}

export interface VerifiedInstallTarget {
  target: string;
  source: "npm" | "github";
  packageName: string | null;
  needsBuildApproval: boolean;
  /** Exact pnpm allowBuilds keys verified for this source. */
  buildApprovalKeys: string[];
}

interface PackageManifest {
  name?: unknown;
  scripts?: {
    preinstall?: unknown;
    install?: unknown;
    postinstall?: unknown;
    prepare?: unknown;
  };
  dsh?: { bundle?: { patch?: unknown } };
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

const verificationCache = new Map<string, { value: VerifiedInstallTarget; verifiedAt: number }>();

export function clearInstallVerificationCache(): void {
  verificationCache.clear();
}

function isBundleManifest(value: unknown): value is PackageManifest {
  if (value === null || typeof value !== "object") return false;
  const manifest = value as PackageManifest;
  return typeof manifest.dsh?.bundle?.patch === "string" && manifest.dsh.bundle.patch.trim().length > 0;
}

function verifiedTarget(
  target: string,
  manifest: PackageManifest,
  source: "npm" | "github",
  github?: { owner: string; repo: string; sha: string | null },
): VerifiedInstallTarget {
  // Published npm packages may legitimately keep workspace-only tooling in
  // devDependencies: pnpm does not install it for a registry dependency.
  const sections = source === "github"
    ? ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const
    : ["dependencies", "optionalDependencies", "peerDependencies"] as const;
  const workspaceDeps: string[] = [];
  for (const section of sections) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      if (typeof range === "string" && range.startsWith("workspace:")) {
        workspaceDeps.push(`${name}@${range}`);
      }
    }
  }
  if (workspaceDeps.length > 0) {
    throw new InstallVerificationError(
      `项目本身问题：该项目依赖 monorepo 内部 workspace 包，尚未提供可独立安装的插件包：${workspaceDeps.slice(0, 3).join("、")}`,
      true,
    );
  }
  const packageName = typeof manifest.name === "string" && manifest.name.trim() ? manifest.name : null;
  if (!packageName) {
    throw new InstallVerificationError("项目本身问题：插件 package.json 缺少有效的 name", true);
  }
  const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"] as const;
  const needsBuildApproval = lifecycleScripts.some((name) => {
    const command = manifest.scripts?.[name];
    return typeof command === "string" && command.trim() !== "";
  });
  const buildApprovalKeys = !needsBuildApproval
    ? []
    : source === "npm"
      ? [packageName]
      : github === undefined
        ? []
        : [
            `${packageName}@git+https://github.com/${github.owner}/${github.repo}.git`,
            ...(github.sha ? [`${packageName}@https://codeload.github.com/${github.owner}/${github.repo}/tar.gz/${github.sha}`] : []),
          ];
  return {
    target,
    source,
    packageName,
    needsBuildApproval,
    buildApprovalKeys,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "dsh-top100-plugin",
  };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (token && url.startsWith("https://api.github.com/")) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if ((response.status === 403 || response.status === 429) && remaining === "0") {
      throw new InstallVerificationError(
        "GitHub 安装源验证额度已用尽，请稍后重试；配置 GITHUB_TOKEN 或 GH_TOKEN 可提高额度",
        true,
      );
    }
    throw new InstallVerificationError(
      `安装源验证失败：${response.status} ${response.statusText || "request failed"}`,
      response.status === 404,
      response.status,
    );
  }
  return response.json();
}

async function fetchOptionalJson(url: string): Promise<unknown | null> {
  try {
    return await fetchJson(url);
  } catch (error) {
    if (error instanceof InstallVerificationError && error.status === 404) return null;
    throw error;
  }
}

async function verifyNpm(spec: string): Promise<VerifiedInstallTarget> {
  const parsed = npmPackageSpec(spec);
  if (!parsed) throw new InstallVerificationError("npm 安装源格式无效", true);
  const encoded = parsed.name.startsWith("@")
    ? `@${encodeURIComponent(parsed.name.slice(1))}`
    : encodeURIComponent(parsed.name);
  const selector = encodeURIComponent(parsed.selector ?? "latest");
  const manifest = await fetchJson(`https://registry.npmjs.org/${encoded}/${selector}`);
  if (!isBundleManifest(manifest)) {
    throw new InstallVerificationError("目标 npm 包没有声明 dsh.bundle，不能作为 DSH 插件安装");
  }
  return verifiedTarget(spec, manifest, "npm");
}

function hasLifecycleScript(manifest: PackageManifest): boolean {
  return ["preinstall", "install", "postinstall", "prepare"].some((name) => {
    const command = manifest.scripts?.[name as keyof NonNullable<PackageManifest["scripts"]>];
    return typeof command === "string" && command.trim() !== "";
  });
}

async function githubCommit(owner: string, repo: string, ref: string): Promise<string | null> {
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref.toLowerCase();
  const payload = await fetchJson(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
  );
  const sha = (payload as { sha?: unknown })?.sha;
  return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
}

async function verifiedGitHubTarget(
  target: string,
  manifest: PackageManifest,
  owner: string,
  repo: string,
  ref: string,
): Promise<VerifiedInstallTarget> {
  const sha = hasLifecycleScript(manifest) ? await githubCommit(owner, repo, ref) : null;
  const value = verifiedTarget(target, manifest, "github", { owner, repo, sha });
  if (value.needsBuildApproval && value.buildApprovalKeys.length < 2) {
    throw new InstallVerificationError("GitHub 构建插件无法解析到不可变 commit，已拒绝写入不完整的 allowBuilds", true);
  }
  return value;
}

function decodeGitHubManifest(payload: unknown): unknown | null {
  if (payload === null || typeof payload !== "object" || typeof (payload as { content?: unknown }).content !== "string") {
    return null;
  }
  try {
    return JSON.parse(Buffer.from((payload as { content: string }).content, "base64").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

async function verifyGitHub(spec: string): Promise<VerifiedInstallTarget> {
  const match = spec.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9._~+/:=-]+))?$/);
  if (!match) throw new InstallVerificationError("GitHub 安装源格式无效", true);
  const [, owner, repo, selector] = match;
  const pathSelector = selector?.match(/^path:\/?(.+)$/);
  if (pathSelector) {
    const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    const branch =
      typeof (repository as { default_branch?: unknown })?.default_branch === "string"
        ? (repository as { default_branch: string }).default_branch
        : "main";
    const packagePath = `${pathSelector[1]}/package.json`;
    const encodedPath = packagePath.split("/").map(encodeURIComponent).join("/");
    const manifest = decodeGitHubManifest(await fetchOptionalJson(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    ));
    if (!isBundleManifest(manifest)) {
      throw new InstallVerificationError("指定 path 子目录没有 dsh.bundle", true);
    }
    return verifiedGitHubTarget(spec, manifest, owner, repo, branch);
  }
  const ref = selector;
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const payload = await fetchOptionalJson(
    `https://api.github.com/repos/${owner}/${repo}/contents/package.json${query}`,
  );
  const rootManifest = decodeGitHubManifest(payload);
  if (isBundleManifest(rootManifest)) {
    if (ref) return verifiedGitHubTarget(spec, rootManifest, owner, repo, ref);
    if (!hasLifecycleScript(rootManifest)) {
      return verifiedTarget(spec, rootManifest, "github", { owner, repo, sha: null });
    }
    const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    const branch =
      typeof (repository as { default_branch?: unknown })?.default_branch === "string"
        ? (repository as { default_branch: string }).default_branch
        : "main";
    return verifiedGitHubTarget(spec, rootManifest, owner, repo, branch);
  }
  if (ref) throw new InstallVerificationError("指定 ref 的仓库根目录没有 dsh.bundle");

  const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
  const branch =
    typeof (repository as { default_branch?: unknown })?.default_branch === "string"
      ? (repository as { default_branch: string }).default_branch
      : "main";
  const tree = await fetchJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const treeItems = (tree as { tree?: unknown })?.tree;
  const candidates = Array.isArray(treeItems)
    ? treeItems
        .filter((item): item is { type: string; path: string } => {
          return item !== null
            && typeof item === "object"
            && (item as { type?: unknown }).type === "blob"
            && typeof (item as { path?: unknown }).path === "string";
        })
        .filter((item) => item.path.endsWith("/package.json"))
        .filter((item) => item.path.split("/").length <= 4)
        .filter((item) => /(?:^|\/)(?:dsh[^/]*|[^/]*(?:plugin|bundle|client)[^/]*)(?:\/|$)/i.test(item.path))
        .slice(0, 20)
    : [];
  for (const candidate of candidates) {
    const packagePath = candidate.path;
    const directory = packagePath.slice(0, -"/package.json".length);
    const encodedPath = packagePath.split("/").map(encodeURIComponent).join("/");
    const child = await fetchOptionalJson(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    );
    const manifest = decodeGitHubManifest(child);
    if (isBundleManifest(manifest)) {
      return verifiedGitHubTarget(
        `github:${owner}/${repo}#path:/${directory}`,
        manifest,
        owner,
        repo,
        branch,
      );
    }
  }
  throw new InstallVerificationError("仓库根目录及候选子目录均未找到 dsh.bundle");
}

export async function verifyInstallSpec(spec: InstallSpec): Promise<VerifiedInstallTarget> {
  const key = `${spec.kind}:${spec.spec}`;
  const cached = verificationCache.get(key);
  if (cached && Date.now() - cached.verifiedAt < VERIFICATION_CACHE_MS) return cached.value;
  const value = spec.kind === "npm" ? await verifyNpm(spec.spec) : await verifyGitHub(spec.spec);
  verificationCache.set(key, { value, verifiedAt: Date.now() });
  return value;
}
