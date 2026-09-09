/** Bind updates to installed identity and immutable, separately approved source evidence. */
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { isNpmRegistrySpecifier, parseInstallSpec, npmPackageSpec } from "../install/install-spec.js";
import { verifyInstallSpec } from "../install/install-verify.js";
import { MAX_UPDATE_BATCH_SIZE } from "../shared/types.js";
import { bundleInstallPreflight } from "./install-preflight.js";
import { resolveUpdateSource } from "./update-source.js";
import { readBundleProvenance } from "./provenance.js";
import { isProtectedPackage } from "./patch-toggle.js";
import { profileDir, readInstalled, readInstalledManifest } from "./profile.js";
import { compareSemver, parseSemver } from "./semver.js";
import { parseGitHubSource, githubRepositoryIdentity, githubInstallTarget } from "../shared/github-source.js";
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
export class UpdateNotAvailableError extends Error {
    code = "no-update";
    constructor(message) {
        super(message);
        this.name = "UpdateNotAvailableError";
    }
}
const approvals = new Map();
const identities = new WeakMap();
const sessions = new Map();
const draftSessions = new WeakMap();
function sessionDirectory(profile, directory) {
    return realpathSync(resolve(profileDir(profile, directory)));
}
function requireUpdateSession(token, profile, directory) {
    removeExpiredApprovals();
    const session = sessions.get(token);
    if (!session)
        throw new Error("批量更新检查会话已过期，请重新检查");
    if (session.profile !== profile || session.directory !== sessionDirectory(profile, directory)) {
        throw new Error("批量更新检查会话与当前 Profile 不匹配");
    }
    return session;
}
export function startUpdatePreflightSession(profile, directory) {
    removeExpiredApprovals();
    const sessionToken = randomUUID();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionToken, { profile, directory: sessionDirectory(profile, directory), expiresAt, tokens: new Set(), names: new Set() });
    return { sessionToken, expiresAt };
}
export function discardUpdatePreflightSession(token, profile, directory) {
    const session = requireUpdateSession(token, profile, directory);
    for (const approvalToken of session.tokens)
        approvals.delete(approvalToken);
    sessions.delete(token);
}
/** Draft checks cannot install. Only this final identity check opens the ten-minute confirmation window. */
export function finalizeUpdatePreflightSession(token, profile, directory) {
    const session = requireUpdateSession(token, profile, directory);
    const collected = [...session.tokens].map((approvalToken) => {
        const approval = approvals.get(approvalToken);
        if (!approval || draftSessions.get(approval) !== session)
            throw new Error("批量更新检查结果不完整，请重新检查");
        assertUpdateUnchanged(approval, profile, directory);
        return approval;
    });
    const expiresAt = Date.now() + APPROVAL_TTL_MS;
    for (const approval of collected) {
        approvals.delete(approval.preflight.approvalToken);
        approval.preflight = { ...approval.preflight, approvalToken: randomUUID(), expiresAt };
        draftSessions.delete(approval);
        approvals.set(approval.preflight.approvalToken, approval);
    }
    sessions.delete(token);
    return collected.map(({ name, currentVersion, preflight }) => ({ name, currentVersion, preflight }));
}
function installedIdentity(name, profile, explicitDir) {
    if (npmPackageSpec(name)?.name !== name)
        throw new Error("插件包名无效");
    if (isProtectedPackage(name))
        throw new Error("受保护的插件不能在此更新");
    const spec = readInstalled(profile, explicitDir)[name];
    if (typeof spec !== "string")
        throw new Error("插件未安装或已从 Profile 移除");
    if (/^(?:link|file):/.test(spec))
        throw new Error("本地插件请在源码目录更新");
    // Never turn an unrecognized URL, npm alias or workspace source into a same-name registry package.
    if (!parseGitHubSource(spec) && !isNpmRegistrySpecifier(spec)) {
        throw new Error("当前插件安装源不支持自动更新，请使用原安装方式");
    }
    const manifest = readInstalledManifest(profile, name, explicitDir);
    if (!manifest || typeof manifest.name !== "string" || manifest.name.toLowerCase() !== name.toLowerCase()) {
        throw new Error("已安装插件的包名无法核对，请先修复本地安装");
    }
    const repository = manifest.repository;
    const repoObject = repository !== null && typeof repository === "object"
        ? repository : undefined;
    const url = typeof repository === "string" ? repository : repoObject?.url;
    const path = repoObject?.directory;
    const directory = resolve(profileDir(profile, explicitDir));
    return {
        profile,
        directory: realpathSync(directory),
        spec,
        version: typeof manifest.version === "string" ? manifest.version : null,
        packageName: manifest.name,
        manifestFingerprint: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
        provenanceFingerprint: createHash("sha256").update(JSON.stringify(readBundleProvenance(name, profile, explicitDir))).digest("hex"),
        repositoryUrl: typeof url === "string" ? url.trim() : null,
        repositoryPath: typeof path === "string" ? path.trim().replace(/^\.\//, "").replace(/^\/+|\/+$/g, "") || null : null,
    };
}
export function assertUpdateUnchanged(approval, profile, profileDirectory) {
    const original = identities.get(approval);
    const current = installedIdentity(approval.name, profile, profileDirectory);
    if (!original || JSON.stringify(current) !== JSON.stringify(original)) {
        throw new Error("插件版本、安装来源或 Profile 已变化，请重新检查更新");
    }
}
function removeExpiredApprovals() {
    for (const [token, approval] of approvals) {
        if (approval.preflight.expiresAt <= Date.now())
            approvals.delete(token);
    }
    for (const [token, session] of sessions) {
        if (session.expiresAt <= Date.now()) {
            for (const approvalToken of session.tokens)
                approvals.delete(approvalToken);
            sessions.delete(token);
        }
    }
}
export async function createUpdatePreflight(name, profile, profileDirectory, signal, strategy = "preserve", sessionToken) {
    signal?.throwIfAborted();
    removeExpiredApprovals();
    const session = sessionToken !== undefined ? requireUpdateSession(sessionToken, profile, profileDirectory) : undefined;
    if (session && (session.tokens.size >= MAX_UPDATE_BATCH_SIZE || session.names.has(name.toLowerCase()))) {
        throw new Error("批量更新检查包含重复插件或超过数量限制");
    }
    const identity = installedIdentity(name, profile, profileDirectory);
    const sourcePolicy = resolveUpdateSource(name, identity.spec, {
        version: identity.version,
        provenance: readBundleProvenance(name, profile, profileDirectory),
        strategy,
    });
    // This target was rebuilt from validated local source evidence. Raw catalog
    // command parsing still rejects '&' and never gains access to this path.
    const githubTarget = sourcePolicy ? parseGitHubSource(sourcePolicy.target) : null;
    const spec = githubTarget
        ? { kind: "github", spec: githubInstallTarget(githubTarget) }
        : sourcePolicy ? parseInstallSpec(sourcePolicy.target) : null;
    if (!spec)
        throw new Error("当前插件安装源不支持自动更新");
    const source = spec.kind === "github" ? parseGitHubSource(spec.spec) : null;
    const sourceRepository = source?.repository;
    const manifestRepository = githubRepositoryIdentity(identity.repositoryUrl) ?? undefined;
    if (sourceRepository && manifestRepository && sourceRepository !== manifestRepository) {
        throw new Error("已安装插件声明的仓库与安装来源不一致，请先核对本地安装");
    }
    const sourcePath = source?.path ?? undefined;
    if (sourcePath && identity.repositoryPath && sourcePath !== identity.repositoryPath) {
        throw new Error("已安装插件声明的仓库子目录与安装来源不一致");
    }
    const expectedRepository = sourceRepository ?? manifestRepository;
    const expiresAt = session?.expiresAt ?? Date.now() + APPROVAL_TTL_MS;
    const verifiedTarget = await verifyInstallSpec(spec, {
        signal,
        forceRefresh: true,
        expectedPackageName: identity.packageName,
        expectedRepository,
        expectedRepositoryPath: sourcePath ?? identity.repositoryPath ?? undefined,
    });
    if (spec.kind === "npm") {
        const currentVersion = identity.version?.trim().replace(/^v/, "");
        const targetVersion = verifiedTarget.version?.trim().replace(/^v/, "");
        if (!currentVersion || !parseSemver(currentVersion)) {
            throw new Error("当前插件版本无法核对，请先修复本地安装后再检查更新");
        }
        if (!targetVersion || !parseSemver(targetVersion)) {
            throw new Error("更新目标没有可核对的版本，已停止更新");
        }
        const compared = compareSemver(targetVersion, currentVersion);
        if (compared === 0)
            throw new UpdateNotAvailableError(`插件已是最新版本（${identity.version}），无需更新`);
        if (compared < 0) {
            throw new UpdateNotAvailableError(`更新目标版本 ${verifiedTarget.version} 低于当前版本 ${identity.version}，已停止更新`);
        }
    }
    else {
        const installedRef = parseGitHubSource(identity.spec)?.ref;
        if (installedRef && /^[0-9a-f]{40}$/i.test(installedRef)
            && installedRef.toLowerCase() === verifiedTarget.commit?.toLowerCase()) {
            throw new UpdateNotAvailableError("插件已是最新提交，无需更新");
        }
    }
    const bundleTarget = spec.kind === "npm" && !expectedRepository
        ? { ...verifiedTarget, repositoryIdentity: "unavailable" }
        : verifiedTarget;
    signal?.throwIfAborted();
    if (Date.now() >= expiresAt)
        throw new Error("更新预检已过期，请重新检查");
    const preflight = bundleInstallPreflight(bundleTarget, {
        fullName: expectedRepository ?? githubRepositoryIdentity(bundleTarget.repositoryUrl) ?? name,
        profile,
        approvalToken: randomUUID(),
        expiresAt,
    });
    const approval = { name, currentSpec: identity.spec, currentVersion: identity.version, preflight, bundleTarget };
    identities.set(approval, identity);
    assertUpdateUnchanged(approval, profile, profileDirectory);
    signal?.throwIfAborted();
    if (session) {
        if (requireUpdateSession(sessionToken, profile, profileDirectory) !== session
            || session.tokens.size >= MAX_UPDATE_BATCH_SIZE || session.names.has(name.toLowerCase())) {
            throw new Error("批量更新检查会话已变化，请重新检查");
        }
        session.tokens.add(preflight.approvalToken);
        session.names.add(name.toLowerCase());
        draftSessions.set(approval, session);
    }
    approvals.set(preflight.approvalToken, approval);
    return approval;
}
/** Validate the entire batch before consuming any token. */
export function validateUpdateApprovals(requests, profile, profileDirectory) {
    removeExpiredApprovals();
    if (requests.length === 0)
        throw new Error("请选择需要更新的插件");
    const names = new Set();
    const tokens = new Set();
    const result = requests.map((request) => {
        if (names.has(request.name.toLowerCase()) || tokens.has(request.approvalToken)) {
            throw new Error("更新列表包含重复的插件或确认令牌");
        }
        names.add(request.name.toLowerCase());
        tokens.add(request.approvalToken);
        const approval = approvals.get(request.approvalToken);
        if (!approval)
            throw new Error("更新确认已过期，请重新检查精确来源与风险");
        if (draftSessions.has(approval))
            throw new Error("批量更新仍在检查中，需要完成全部检查后重新确认");
        if (approval.name !== request.name || approval.preflight.profile !== profile) {
            throw new Error("更新确认与当前插件或 Profile 不匹配");
        }
        if (approval.preflight.requiresExplicitApproval && request.risksAccepted !== true) {
            throw new Error("该更新包含警告项，需要明确确认来源、脚本与风险");
        }
        assertUpdateUnchanged(approval, profile, profileDirectory);
        return approval;
    });
    for (const approval of result)
        approvals.delete(approval.preflight.approvalToken);
    return result;
}
export function clearUpdateApprovals() {
    approvals.clear();
    sessions.clear();
}
export function discardUpdateApprovals(tokens) {
    for (const token of tokens) {
        const approval = approvals.get(token);
        const session = approval ? draftSessions.get(approval) : undefined;
        if (session && approval) {
            session.tokens.delete(token);
            session.names.delete(approval.name.toLowerCase());
        }
        approvals.delete(token);
    }
}
