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
function verifiedTarget(target, manifest, source) {
    const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
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
    const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];
    const needsBuildApproval = lifecycleScripts.some((name) => {
        const command = manifest.scripts?.[name];
        return typeof command === "string" && command.trim() !== "";
    });
    return {
        target,
        source,
        packageName,
        needsBuildApproval,
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
async function verifyNpm(spec) {
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
    return verifiedTarget(spec, manifest, "npm");
}
async function verifyGitHub(spec) {
    const match = spec.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9._-]+))?$/);
    if (!match)
        throw new InstallVerificationError("GitHub 安装源格式无效", true);
    const [, owner, repo, ref] = match;
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const payload = await fetchOptionalJson(`https://api.github.com/repos/${owner}/${repo}/contents/package.json${query}`);
    if (payload !== null && typeof payload === "object" && typeof payload.content === "string") {
        try {
            const manifest = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
            if (isBundleManifest(manifest))
                return verifiedTarget(spec, manifest, "github");
        }
        catch (error) {
            if (error instanceof InstallVerificationError && error.fatal)
                throw error;
        }
    }
    if (ref)
        throw new InstallVerificationError("指定 ref 的仓库根目录没有 dsh.bundle");
    const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    const branch = typeof repository?.default_branch === "string"
        ? repository.default_branch
        : "main";
    const tree = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
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
        const encodedPath = packagePath.split("/").map(encodeURIComponent).join("/");
        const child = await fetchOptionalJson(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
        if (child === null || typeof child !== "object" || typeof child.content !== "string") {
            continue;
        }
        try {
            const manifest = JSON.parse(Buffer.from(child.content, "base64").toString("utf8"));
            if (isBundleManifest(manifest)) {
                return verifiedTarget(`github:${owner}/${repo}#path:${directory}`, manifest, "github");
            }
        }
        catch (error) {
            if (error instanceof InstallVerificationError && error.fatal)
                throw error;
        }
    }
    throw new InstallVerificationError("仓库根目录及候选子目录均未找到 dsh.bundle");
}
export async function verifyInstallSpec(spec) {
    const key = `${spec.kind}:${spec.spec}`;
    const cached = verificationCache.get(key);
    if (cached && Date.now() - cached.verifiedAt < VERIFICATION_CACHE_MS)
        return cached.value;
    const value = spec.kind === "npm" ? await verifyNpm(spec.spec) : await verifyGitHub(spec.spec);
    verificationCache.set(key, { value, verifiedAt: Date.now() });
    return value;
}
