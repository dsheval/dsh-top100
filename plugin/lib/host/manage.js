/** List and mutate installed profile plugins and local skills. */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { withReviewedDescription } from "../shared/descriptions.js";
import { npmPackageSpec, resolveInstallSpec } from "../install/install-spec.js";
import { fetchNpmManifest } from "../install/install-verify.js";
import { isProtectedPackage, packageIsDisabled, removeRowBlocks, rowIdsForPackage, userPatchPath } from "./patch-toggle.js";
import { readInstalled, readInstalledManifest, readInstalledVersion } from "./profile.js";
import { compareSemver, parseSemver } from "./semver.js";
import { readBundleProvenance } from "./provenance.js";
import { resolveUpdateSource } from "./update-source.js";
import { parseGitHubSource, githubRepositoryIdentity } from "../shared/github-source.js";
const UPDATE_CACHE_MS = 5 * 60 * 1000;
const latestCache = new Map();
export function skillsRoot() {
    return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "skills");
}
export function matchCatalogEntry(document, name, spec, fullName) {
    if (!document)
        return undefined;
    const source = parseGitHubSource(spec);
    const repository = (source?.repository ?? fullName)?.toLowerCase();
    const packageName = name.toLowerCase();
    const matches = document.rankings.total.filter((entry) => {
        const target = resolveInstallSpec(entry);
        const declaredNames = [entry.install?.packageName, target?.kind === "npm" ? npmPackageSpec(target.spec)?.name : null]
            .filter((value) => Boolean(value)).map((value) => value.toLowerCase());
        const packageMatches = declaredNames.includes(packageName);
        if (declaredNames.length > 0 && !packageMatches)
            return false;
        if (repository && entry.fullName.toLowerCase() !== repository)
            return false;
        if (source?.path) {
            const entryPath = entry.install?.repositoryPath?.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "")
                ?? (target?.kind === "github" ? parseGitHubSource(target.spec)?.path : null);
            if (entryPath !== source.path)
                return false;
        }
        return packageMatches || entry.fullName.toLowerCase() === (repository ?? packageName);
    });
    // Monorepos or duplicate package declarations need more evidence, not a first-match guess.
    return matches.length === 1 ? matches[0] : undefined;
}
export async function fetchNpmLatest(name, forceRefresh = false, selector = "latest") {
    const key = `${name}@${selector}`;
    const cached = latestCache.get(key);
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < UPDATE_CACHE_MS)
        return cached.version;
    try {
        const body = await fetchNpmManifest(name, selector, AbortSignal.timeout(8_000));
        const version = typeof body?.version === "string" && parseSemver(body.version.replace(/^v/, "")) ? body.version : null;
        if (version)
            latestCache.set(key, { version, fetchedAt: Date.now() });
        else
            latestCache.delete(key);
        return version;
    }
    catch {
        latestCache.delete(key);
        return null;
    }
}
function updateAvailable(current, latest) {
    const installed = current?.replace(/^v/, "");
    const target = latest?.replace(/^v/, "");
    return Boolean(installed && target && parseSemver(installed) && parseSemver(target) && compareSemver(installed, target) < 0);
}
const HAN_TEXT_RE = /\p{Script=Han}/u;
function cleanDescription(value) {
    return value?.trim() ?? "";
}
/**
 * Pick an author/catalog supplied Chinese description without inventing a
 * translation. English-only metadata falls back to an explicit inventory
 * summary so the management page remains understandable in Chinese.
 */
export function managedDescriptionZh(options) {
    const catalogChinese = cleanDescription(options.descriptionZh);
    if (catalogChinese)
        return catalogChinese;
    const suppliedChinese = (options.descriptions ?? [])
        .map(cleanDescription)
        .find((description) => HAN_TEXT_RE.test(description));
    if (suppliedChinese)
        return suppliedChinese;
    return options.kind === "skill"
        ? `已安装的本地技能（Skill）：${options.name}。暂无中文简介。`
        : `已安装的 DSH 插件：${options.name}。暂无中文简介。`;
}
export function resolveUpdateTarget(name, spec) {
    return resolveUpdateSource(name, spec)?.target ?? null;
}
function listSkills() {
    const root = skillsRoot();
    if (!existsSync(root))
        return [];
    return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
        let description = "";
        try {
            description = /^description:\s*(.+)$/m.exec(readFileSync(join(root, entry.name, "SKILL.md"), "utf8"))?.[1]?.trim() ?? "";
        }
        catch { /* no manifest */ }
        return {
            name: entry.name,
            spec: `skill:${entry.name}`,
            version: null,
            description,
            descriptionZh: managedDescriptionZh({ kind: "skill", name: entry.name, descriptions: [description] }),
            fullName: null,
            url: null,
            enabled: true,
            updateAvailable: false,
            latest: null,
            local: true,
            protected: false,
            kind: "skill",
            scope: "global",
            activationState: "not-applicable",
        };
    });
}
export async function listManagedPlugins(profile, document, explicitDir, refreshUpdates = false) {
    const plugins = await Promise.all(Object.entries(readInstalled(profile, explicitDir)).map(async ([name, spec]) => {
        const manifest = readInstalledManifest(profile, name, explicitDir);
        const source = parseGitHubSource(spec);
        const fullName = source?.repository ?? githubRepositoryIdentity(manifest?.repository);
        const matched = matchCatalogEntry(document, name, spec, fullName);
        const catalog = matched ? withReviewedDescription(matched, document ?? {}) : undefined;
        const version = readInstalledVersion(profile, name, explicitDir);
        const local = spec.startsWith("link:") || spec.startsWith("file:");
        let updateTarget = null;
        let updatePolicy = "当前安装来源不支持自动更新";
        let updateError;
        if (!local) {
            try {
                const updateSource = resolveUpdateSource(name, spec, {
                    version, provenance: readBundleProvenance(name, profile, explicitDir),
                });
                if (updateSource) {
                    updateTarget = updateSource.target;
                    updatePolicy = updateSource.policy;
                }
            }
            catch (error) {
                updateError = error instanceof Error ? error.message : String(error);
                updatePolicy = updateError;
            }
        }
        const npmTarget = updateTarget ? npmPackageSpec(updateTarget) : null;
        const latest = npmTarget ? await fetchNpmLatest(name, refreshUpdates, npmTarget.selector ?? "latest") : null;
        const available = updateAvailable(version, latest);
        const protectedPackage = isProtectedPackage(name);
        const updateStatus = local || protectedPackage ? "not-supported"
            : updateError || (npmTarget && !latest) ? "failed"
                : latest && version && parseSemver(version.replace(/^v/, "")) ? available ? "available" : "current"
                    : "unknown";
        const updateCheckedAt = npmTarget
            ? latestCache.get(`${name}@${npmTarget.selector ?? "latest"}`)?.fetchedAt ?? Date.now()
            : updateError ? Date.now() : undefined;
        const description = catalog?.description || manifest?.description || "";
        const enabled = !packageIsDisabled(profile, name, explicitDir);
        return {
            name,
            spec,
            version,
            description,
            descriptionZh: managedDescriptionZh({
                kind: "bundle",
                name,
                descriptionZh: catalog?.descriptionZh,
                descriptions: [catalog?.description, manifest?.description],
            }),
            fullName: catalog?.fullName ?? fullName,
            url: catalog?.url ?? (fullName ? `https://github.com/${fullName}` : manifest?.homepage ?? null),
            enabled,
            updateAvailable: available,
            updateStatus,
            ...(updateCheckedAt ? { updateCheckedAt } : {}),
            latest,
            updateTarget,
            updatePolicy,
            ...(updateError ? { updateError } : {}),
            local,
            protected: protectedPackage,
            kind: "bundle",
            activationState: enabled ? "unknown" : "inert",
        };
    }));
    return [...plugins, ...listSkills()].sort((left, right) => left.name.localeCompare(right.name));
}
export function uninstallSkill(name) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
        throw new Error("Skill 目录名无效");
    const target = join(skillsRoot(), name);
    if (!existsSync(target))
        throw new Error("Skill 未安装");
    rmSync(target, { recursive: true, force: true });
}
export function cleanupAfterUninstall(profile, name, rowIds = undefined, explicitDir) {
    removeRowBlocks(userPatchPath(profile, explicitDir), rowIds ?? rowIdsForPackage(profile, name, explicitDir));
}
