/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */
import { npmPackageSpec } from "./install-spec.js";
const MANIFEST_TIMEOUT_MS = 15_000;
const VERIFICATION_CACHE_MS = 10 * 60 * 1000;
export class InstallVerificationError extends Error {
    fatal;
    status;
    constructor(message, fatal = false, status = null) {
        super(message);
        this.name = "InstallVerificationError";
        this.fatal = fatal;
        this.status = status;
    }
}
const verificationCache = new Map();
export function clearInstallVerificationCache() {
    verificationCache.clear();
}
function isBundleManifest(value) {
    if (value === null || typeof value !== "object")
        return false;
    const manifest = value;
    return typeof manifest.dsh?.bundle?.patch === "string" && manifest.dsh.bundle.patch.trim().length > 0;
}
function lifecycleScriptEvidence(manifest) {
    const names = ["preinstall", "install", "postinstall", "prepare"];
    return names.flatMap((name) => {
        const command = manifest.scripts?.[name];
        return typeof command === "string" && command.trim()
            ? [{ name, command: command.trim() }]
            : [];
    });
}
function repositoryUrl(value) {
    if (typeof value === "string" && value.trim())
        return value.trim();
    if (value !== null && typeof value === "object") {
        const url = value.url;
        return typeof url === "string" && url.trim() ? url.trim() : null;
    }
    return null;
}
function githubRepositorySlug(value) {
    const match = value
        .replace(/^git\+/, "")
        .replace(/^git@github\.com:/i, "https://github.com/")
        .match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/]|$)/i);
    return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}
function npmRepositoryIdentity(url, expectedRepository) {
    if (!expectedRepository)
        return "not-applicable";
    if (!url)
        return "unavailable";
    const actual = githubRepositorySlug(url);
    if (!actual)
        return "unavailable";
    if (actual !== expectedRepository.toLowerCase()) {
        throw new InstallVerificationError(`npm 包声明的仓库 ${actual} 与目录条目 ${expectedRepository.toLowerCase()} 不一致，已停止安装`, true);
    }
    return "matched";
}
function verifiedTarget(requestedTarget, target, manifest, source, resolved = {}) {
    // Published npm packages may legitimately keep workspace-only tooling in
    // devDependencies: pnpm does not install it for a registry dependency.
    const sections = source === "github"
        ? ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
        : ["dependencies", "optionalDependencies", "peerDependencies"];
    const workspaceDeps = [];
    for (const section of sections) {
        for (const [name, range] of Object.entries(manifest[section] ?? {})) {
            if (typeof range === "string" && range.startsWith("workspace:")) {
                workspaceDeps.push(`${name}@${range}`);
            }
        }
    }
    if (workspaceDeps.length > 0) {
        throw new InstallVerificationError(`项目本身问题：该项目依赖 monorepo 内部 workspace 包，尚未提供可独立安装的插件包：${workspaceDeps.slice(0, 3).join("、")}`, true);
    }
    const packageName = typeof manifest.name === "string" && manifest.name.trim() ? manifest.name : null;
    if (!packageName) {
        throw new InstallVerificationError("项目本身问题：插件 package.json 缺少有效的 name", true);
    }
    const lifecycleScripts = lifecycleScriptEvidence(manifest);
    const needsBuildApproval = lifecycleScripts.length > 0;
    const buildApprovalKeys = !needsBuildApproval
        ? []
        : source === "npm"
            ? [packageName]
            : resolved.github === undefined
                ? []
                : [
                    `${packageName}@git+https://github.com/${resolved.github.owner}/${resolved.github.repo}.git`,
                    `${packageName}@https://codeload.github.com/${resolved.github.owner}/${resolved.github.repo}/tar.gz/${resolved.github.sha}`,
                ];
    return {
        requestedTarget,
        target,
        source,
        packageName,
        version: resolved.version ?? (typeof manifest.version === "string" ? manifest.version : null),
        commit: resolved.commit ?? null,
        integrity: resolved.integrity ?? null,
        repositoryUrl: resolved.repositoryUrl ?? null,
        repositoryIdentity: resolved.repositoryIdentity ?? "not-applicable",
        lifecycleScripts,
        verifiedAt: Date.now(),
        needsBuildApproval,
        buildApprovalKeys,
    };
}
async function fetchJson(url) {
    const headers = {
        accept: "application/json",
        "user-agent": "dsh-top100-plugin",
    };
    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    if (token && url.startsWith("https://api.github.com/"))
        headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        if ((response.status === 403 || response.status === 429) && remaining === "0") {
            throw new InstallVerificationError("GitHub 安装源验证额度已用尽，请稍后重试；配置 GITHUB_TOKEN 或 GH_TOKEN 可提高额度", true);
        }
        throw new InstallVerificationError(`安装源验证失败：${response.status} ${response.statusText || "request failed"}`, response.status === 404, response.status);
    }
    return response.json();
}
async function fetchOptionalJson(url) {
    try {
        return await fetchJson(url);
    }
    catch (error) {
        if (error instanceof InstallVerificationError && error.status === 404)
            return null;
        throw error;
    }
}
async function verifyNpm(spec, options) {
    const parsed = npmPackageSpec(spec);
    if (!parsed)
        throw new InstallVerificationError("npm 安装源格式无效", true);
    const encoded = parsed.name.startsWith("@")
        ? `@${encodeURIComponent(parsed.name.slice(1))}`
        : encodeURIComponent(parsed.name);
    const selector = encodeURIComponent(parsed.selector ?? "latest");
    const manifest = await fetchJson(`https://registry.npmjs.org/${encoded}/${selector}`);
    if (!isBundleManifest(manifest)) {
        throw new InstallVerificationError("目标 npm 包没有声明 dsh.bundle，不能作为 DSH 插件安装");
    }
    const manifestName = manifest.name;
    const packageName = typeof manifestName === "string" ? manifestName : parsed.name;
    if (packageName.toLowerCase() !== parsed.name.toLowerCase()) {
        throw new InstallVerificationError(`npm registry 返回的包名 ${packageName} 与请求目标 ${parsed.name} 不一致，已停止安装`, true);
    }
    const version = manifest.version;
    if (typeof version !== "string" || !version.trim()) {
        throw new InstallVerificationError("npm registry 返回的包缺少精确 version，已停止安装", true);
    }
    const declaredRepository = repositoryUrl(manifest.repository);
    const integrity = typeof manifest.dist?.integrity === "string"
        ? manifest.dist?.integrity
        : typeof manifest.dist?.shasum === "string"
            ? `sha1-${manifest.dist?.shasum}`
            : null;
    if (!integrity) {
        throw new InstallVerificationError("npm registry 返回的包缺少 integrity/shasum，无法记录可复验摘要", true);
    }
    return verifiedTarget(spec, `${packageName}@${version}`, manifest, "npm", {
        version,
        integrity,
        repositoryUrl: declaredRepository,
        repositoryIdentity: npmRepositoryIdentity(declaredRepository, options.expectedRepository),
    });
}
async function githubCommit(owner, repo, ref) {
    if (/^[0-9a-f]{40}$/i.test(ref))
        return ref.toLowerCase();
    const payload = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`);
    const sha = payload?.sha;
    return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
}
async function githubDefaultBranch(owner, repo) {
    const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    return typeof repository?.default_branch === "string"
        ? repository.default_branch
        : "main";
}
async function githubManifest(owner, repo, packagePath, commit) {
    const encodedPath = packagePath.split("/").map(encodeURIComponent).join("/");
    const payload = await fetchOptionalJson(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(commit)}`);
    const manifest = decodeGitHubManifest(payload);
    return isBundleManifest(manifest) ? manifest : null;
}
function githubTargetAtCommit(target, sha) {
    if (!/^[0-9a-f]{40}$/.test(sha))
        return null;
    const match = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#path:\/?(.+)|#[^&]+)?$/.exec(target);
    if (!match)
        return null;
    return `github:${match[1]}#${sha}${match[2] ? `&path:/${match[2]}` : ""}`;
}
async function verifiedGitHubTarget(target, manifest, owner, repo, ref) {
    const sha = await githubCommit(owner, repo, ref);
    if (!sha)
        throw new InstallVerificationError("GitHub 安装源无法解析到不可变 commit", true);
    const pinned = githubTargetAtCommit(target, sha);
    if (!pinned)
        throw new InstallVerificationError("GitHub 安装源无法生成不可变安装目标", true);
    const value = verifiedTarget(target, pinned, manifest, "github", {
        commit: sha,
        integrity: `git-sha1-${sha}`,
        repositoryUrl: `https://github.com/${owner}/${repo}`,
        repositoryIdentity: "matched",
        github: { owner, repo, sha },
    });
    if (value.needsBuildApproval && value.buildApprovalKeys.length < 2) {
        throw new InstallVerificationError("GitHub 构建插件无法解析到不可变 commit，已拒绝写入不完整的 allowBuilds", true);
    }
    return value;
}
function decodeGitHubManifest(payload) {
    if (payload === null || typeof payload !== "object" || typeof payload.content !== "string") {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
    }
    catch {
        return null;
    }
}
async function verifyGitHub(spec, options) {
    const match = spec.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9._~+/:=-]+))?$/);
    if (!match)
        throw new InstallVerificationError("GitHub 安装源格式无效", true);
    const [, owner, repo, selector] = match;
    const actualRepository = `${owner}/${repo}`.toLowerCase();
    if (options.expectedRepository && actualRepository !== options.expectedRepository.toLowerCase()) {
        throw new InstallVerificationError(`GitHub 安装源 ${actualRepository} 与目录条目 ${options.expectedRepository.toLowerCase()} 不一致，已停止安装`, true);
    }
    const pathSelector = selector?.match(/^path:\/?(.+)$/);
    if (pathSelector) {
        const branch = await githubDefaultBranch(owner, repo);
        const commit = await githubCommit(owner, repo, branch);
        if (!commit)
            throw new InstallVerificationError("GitHub 安装源无法解析到不可变 commit", true);
        const packagePath = `${pathSelector[1]}/package.json`;
        const manifest = await githubManifest(owner, repo, packagePath, commit);
        if (!manifest) {
            throw new InstallVerificationError("指定 path 子目录没有 dsh.bundle", true);
        }
        return verifiedGitHubTarget(spec, manifest, owner, repo, commit);
    }
    const ref = selector;
    const branch = ref ?? await githubDefaultBranch(owner, repo);
    const commit = await githubCommit(owner, repo, branch);
    if (!commit)
        throw new InstallVerificationError("GitHub 安装源无法解析到不可变 commit", true);
    const rootManifest = await githubManifest(owner, repo, "package.json", commit);
    if (rootManifest)
        return verifiedGitHubTarget(spec, rootManifest, owner, repo, commit);
    if (ref)
        throw new InstallVerificationError("指定 ref 的仓库根目录没有 dsh.bundle");
    const tree = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(commit)}?recursive=1`);
    const treeItems = tree?.tree;
    const candidates = Array.isArray(treeItems)
        ? treeItems
            .filter((item) => {
            return item !== null
                && typeof item === "object"
                && item.type === "blob"
                && typeof item.path === "string";
        })
            .filter((item) => item.path.endsWith("/package.json"))
            .filter((item) => item.path.split("/").length <= 4)
            .filter((item) => /(?:^|\/)(?:dsh[^/]*|[^/]*(?:plugin|bundle|client)[^/]*)(?:\/|$)/i.test(item.path))
            .slice(0, 20)
        : [];
    for (const candidate of candidates) {
        const packagePath = candidate.path;
        const directory = packagePath.slice(0, -"/package.json".length);
        const manifest = await githubManifest(owner, repo, packagePath, commit);
        if (manifest) {
            return verifiedGitHubTarget(`github:${owner}/${repo}#path:/${directory}`, manifest, owner, repo, commit);
        }
    }
    throw new InstallVerificationError("仓库根目录及候选子目录均未找到 dsh.bundle");
}
export async function verifyInstallSpec(spec, options = {}) {
    const key = `${spec.kind}:${spec.spec}:${options.expectedRepository?.toLowerCase() ?? ""}`;
    const cached = verificationCache.get(key);
    if (cached && Date.now() - cached.verifiedAt < VERIFICATION_CACHE_MS)
        return cached.value;
    const value = spec.kind === "npm" ? await verifyNpm(spec.spec, options) : await verifyGitHub(spec.spec, options);
    verificationCache.set(key, { value, verifiedAt: Date.now() });
    return value;
}
