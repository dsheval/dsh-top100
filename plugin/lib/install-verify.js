/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */
const MANIFEST_TIMEOUT_MS = 15_000;

export class InstallVerificationError extends Error {
    constructor(message, fatal = false) {
        super(message);
        this.name = "InstallVerificationError";
        this.fatal = fatal;
    }
}

function isBundleManifest(value) {
    if (value === null || typeof value !== "object")
        return false;
    const manifest = value;
    return typeof manifest.dsh?.bundle?.patch === "string"
        && manifest.dsh.bundle.patch.trim().length > 0;
}

function verifiedTarget(target, manifest, source) {
    const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
    const workspaceDeps = [];
    for (const section of sections) {
        for (const [name, range] of Object.entries(manifest?.[section] ?? {})) {
            if (typeof range === "string" && range.startsWith("workspace:"))
                workspaceDeps.push(`${name}@${range}`);
        }
    }
    if (workspaceDeps.length > 0) {
        throw new InstallVerificationError(
            `项目本身问题：该项目依赖 monorepo 内部 workspace 包，尚未提供可独立安装的插件包：${workspaceDeps.slice(0, 3).join("、")}`,
            true,
        );
    }
    const packageName = typeof manifest?.name === "string" ? manifest.name : null;
    const prepare = typeof manifest?.scripts?.prepare === "string" && manifest.scripts.prepare.trim() !== "";
    return {
        target,
        source,
        packageName,
        needsBuildApproval: source === "github" && prepare,
    };
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            accept: "application/json",
            "user-agent": "dsh-top100-plugin",
        },
        signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok)
        throw new Error(`manifest lookup failed: ${response.status} ${response.statusText}`);
    return response.json();
}

async function verifyNpm(spec) {
    const encoded = spec.startsWith("@")
        ? `@${encodeURIComponent(spec.slice(1))}`
        : encodeURIComponent(spec);
    const manifest = await fetchJson(`https://registry.npmjs.org/${encoded}/latest`);
    if (!isBundleManifest(manifest))
        throw new InstallVerificationError("目标 npm 包没有声明 dsh.bundle，不能作为 DSH 插件安装");
    return verifiedTarget(spec, manifest, "npm");
}

async function verifyGitHub(spec) {
    const match = spec.match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9._-]+))?$/);
    if (!match)
        throw new InstallVerificationError("GitHub 安装源格式无效", true);
    const [, owner, repo, ref] = match;
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const payload = await fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/contents/package.json${query}`,
    ).catch(() => null);
    if (payload !== null && typeof payload === "object" && typeof payload.content === "string") {
        try {
            const manifest = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
            if (isBundleManifest(manifest))
                return verifiedTarget(spec, manifest, "github");
        }
        catch (error) {
            if (error instanceof InstallVerificationError && error.fatal)
                throw error;
            // Continue with monorepo discovery.
        }
    }
    if (ref)
        throw new InstallVerificationError("指定 ref 的仓库根目录没有 dsh.bundle");

    const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
    const branch = typeof repository?.default_branch === "string" ? repository.default_branch : "main";
    const tree = await fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    const candidates = Array.isArray(tree?.tree)
        ? tree.tree
            .filter((item) => item?.type === "blob" && typeof item.path === "string")
            .filter((item) => item.path.endsWith("/package.json"))
            .filter((item) => item.path.split("/").length <= 4)
            .filter((item) => /(?:^|\/)(?:dsh[^/]*|[^/]*(?:plugin|bundle|client)[^/]*)(?:\/|$)/i.test(item.path))
            .slice(0, 20)
        : [];
    for (const candidate of candidates) {
        const packagePath = candidate.path;
        const directory = packagePath.slice(0, -"/package.json".length);
        const encodedPath = packagePath.split("/").map(encodeURIComponent).join("/");
        const child = await fetchJson(
            `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
        ).catch(() => null);
        if (child === null || typeof child !== "object" || typeof child.content !== "string")
            continue;
        try {
            const manifest = JSON.parse(Buffer.from(child.content, "base64").toString("utf8"));
            if (isBundleManifest(manifest))
                return verifiedTarget(`github:${owner}/${repo}#path:${directory}`, manifest, "github");
        }
        catch (error) {
            if (error instanceof InstallVerificationError && error.fatal)
                throw error;
            // Try the next candidate.
        }
    }
    throw new InstallVerificationError("仓库根目录及候选子目录均未找到 dsh.bundle");
}

export async function verifyInstallSpec(spec) {
    if (spec.kind === "npm")
        return verifyNpm(spec.spec);
    return verifyGitHub(spec.spec);
}
