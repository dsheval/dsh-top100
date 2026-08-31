/** List and mutate installed profile plugins and local skills. */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findEntry } from "./catalog.js";
import { NPM_SPEC_RE } from "../install/install-spec.js";
import { isProtectedPackage, packageIsDisabled, removeRowBlocks, rowIdsForPackage, userPatchPath } from "./patch-toggle.js";
import { readInstalled, readInstalledManifest, readInstalledVersion } from "./profile.js";
import { compareSemver } from "./semver.js";
const UPDATE_CACHE_MS = 5 * 60 * 1000;
const latestCache = new Map();
export function skillsRoot() {
    return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "skills");
}
function repositoryUrl(repository) {
    if (typeof repository === "string")
        return repository;
    if (repository !== null && typeof repository === "object" && typeof repository.url === "string") {
        return repository.url;
    }
    return null;
}
function githubFullName(spec, repository) {
    const fromSpec = spec.match(/^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
    if (fromSpec)
        return fromSpec[1];
    const fromUrl = repositoryUrl(repository)?.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/i);
    return fromUrl?.[1] ?? null;
}
export function matchCatalogEntry(document, name, spec, fullName) {
    if (!document)
        return undefined;
    if (fullName) {
        const exact = findEntry(document, fullName);
        if (exact)
            return exact;
    }
    return document.rankings.total.find((entry) => {
        const haystack = `${entry.fullName} ${entry.name} ${entry.install?.target ?? ""}`.toLowerCase();
        return haystack.includes(name.toLowerCase()) || (fullName !== null && haystack.includes(fullName.toLowerCase()));
    });
}
export async function fetchNpmLatest(name) {
    const cached = latestCache.get(name);
    if (cached && Date.now() - cached.fetchedAt < UPDATE_CACHE_MS)
        return cached.version;
    try {
        const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
        const response = await fetch(`https://registry.npmjs.org/${encoded}/latest`, {
            headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
            signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok)
            throw new Error(String(response.status));
        const body = (await response.json());
        const version = typeof body.version === "string" ? body.version : null;
        latestCache.set(name, { version, fetchedAt: Date.now() });
        return version;
    }
    catch {
        latestCache.set(name, { version: null, fetchedAt: Date.now() });
        return null;
    }
}
function updateAvailable(current, latest) {
    return Boolean(current && latest && compareSemver(current.replace(/^v/, ""), latest.replace(/^v/, "")) < 0);
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
    if (spec.startsWith("link:") || spec.startsWith("file:"))
        return null;
    if (spec.startsWith("github:")) {
        const match = spec.match(/^(github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#[^&]+)?(?:&path:(\/?[^\s]+))?$/);
        if (!match)
            return null;
        return match[2] ? `${match[1]}#path:${match[2]}` : match[1];
    }
    if (NPM_SPEC_RE.test(name))
        return `${name}@latest`;
    return null;
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
            activationState: "not-applicable",
        };
    });
}
export async function listManagedPlugins(profile, document, explicitDir) {
    const plugins = await Promise.all(Object.entries(readInstalled(profile, explicitDir)).map(async ([name, spec]) => {
        const manifest = readInstalledManifest(profile, name, explicitDir);
        const fullName = githubFullName(spec, manifest?.repository);
        const catalog = matchCatalogEntry(document, name, spec, fullName);
        const version = readInstalledVersion(profile, name, explicitDir);
        const local = spec.startsWith("link:") || spec.startsWith("file:");
        const latest = local || spec.startsWith("github:") ? null : await fetchNpmLatest(name);
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
            updateAvailable: updateAvailable(version, latest),
            latest,
            local,
            protected: isProtectedPackage(name),
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
