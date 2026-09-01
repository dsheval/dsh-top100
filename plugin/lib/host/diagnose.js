/** Read-only profile and rankings diagnostics for the Settings page. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATA_URL, loadSearchRankings, normalizeDataUrl } from "./catalog.js";
import { matchCatalogEntry, skillsRoot } from "./manage.js";
import { isProtectedPackage, packageIsDisabled, parseInsertedIds, readUserPatchState, userPatchPath } from "./patch-toggle.js";
import { INBOX_BUNDLES, profileDir } from "./profile.js";
import { compareSemver, parseSemver, satisfiesRange } from "./semver.js";
import { DIAGNOSTIC_SCHEMA, } from "../shared/types.js";
const HOST_CORE_RE = /^@deepseek-ai\/(?:dsh|cordis)(?:-|$)/;
const STALE_DAYS = 14;
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readJsonFile(path) {
    try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        return isRecord(value) ? value : null;
    }
    catch {
        return null;
    }
}
function stringRecord(value) {
    if (!isRecord(value))
        return {};
    return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === "string"));
}
function pluginVersion() {
    try {
        const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));
        return manifest.version ?? "0.1.0";
    }
    catch {
        return "0.1.0";
    }
}
function findDshInstallDir(entry = process.argv[1]) {
    if (!entry)
        return null;
    let dir = dirname(entry);
    for (let depth = 0; depth < 10; depth += 1) {
        if (readJsonFile(join(dir, "package.json"))?.name === "@deepseek-ai/dsh")
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
    return null;
}
function resolvePackageDir(profileDirectory, name, hostDir) {
    const candidates = [join(profileDirectory, "node_modules", name), hostDir ? join(hostDir, "node_modules", name) : null, join(dirname(profileDirectory), "node_modules", name)];
    return candidates.find((candidate) => Boolean(candidate && existsSync(join(candidate, "package.json")))) ?? null;
}
function patchEntries(directory, manifest) {
    if (!directory || !manifest)
        return { path: null, ids: [] };
    const declared = isRecord(manifest.dsh) && isRecord(manifest.dsh.bundle) && typeof manifest.dsh.bundle.patch === "string"
        ? manifest.dsh.bundle.patch : "cordis.patch.yml";
    const path = join(directory, declared);
    const fallback = join(directory, "cordis.patch.yml");
    const actual = existsSync(path) ? path : existsSync(fallback) ? fallback : null;
    if (!actual)
        return { path: null, ids: [] };
    try {
        return { path: actual, ids: parseInsertedIds(readFileSync(actual, "utf8")) };
    }
    catch {
        return { path: actual, ids: [] };
    }
}
function listSkills() {
    const root = skillsRoot();
    if (!existsSync(root))
        return [];
    return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
        const path = join(root, entry.name, "SKILL.md");
        let description = "";
        try {
            description = /^description:\s*(.+)$/m.exec(readFileSync(path, "utf8"))?.[1]?.trim() ?? "";
        }
        catch { /* missing */ }
        return { name: entry.name, hasManifest: existsSync(path), description };
    }).sort((left, right) => left.name.localeCompare(right.name));
}
function lockfileCoreVersions(directory) {
    let text = "";
    try {
        text = readFileSync(join(directory, "pnpm-lock.yaml"), "utf8");
    }
    catch {
        return [];
    }
    const found = new Map();
    for (const match of text.matchAll(/(@deepseek-ai\/(?:dsh|cordis)[^@\s'"]*?)@([0-9][^\s:'"()]*)/g)) {
        if (!parseSemver(match[2] ?? ""))
            continue;
        const versions = found.get(match[1]) ?? new Set();
        versions.add(match[2]);
        found.set(match[1], versions);
    }
    return [...found].map(([name, versions]) => ({ name, versions: [...versions].sort(compareSemver) })).filter((item) => item.versions.length > 1);
}
function daysBetween(from, now) {
    const stamp = Date.parse(from);
    return Number.isNaN(stamp) ? null : Math.floor((now - stamp) / 86_400_000);
}
export async function buildDiagnosticReport(profile, options = {}) {
    const now = options.now ?? Date.now();
    const directory = options.profileDir ?? profileDir(profile);
    const findings = [];
    const manifest = readJsonFile(join(directory, "package.json"));
    const dependencies = stringRecord(manifest?.dependencies);
    if (!manifest)
        findings.push({ severity: "error", code: "profile-missing", subject: profile, message: `profile 目录不可读：${directory}` });
    const declared = isRecord(manifest?.dsh) && isRecord(manifest.dsh.profile) && Array.isArray(manifest.dsh.profile.bundles)
        ? manifest.dsh.profile.bundles.filter((item) => typeof item === "string") : Object.keys(dependencies);
    // Only scan the bundle order declared by this profile. Other inbox bundles may
    // exist on disk for a different profile and must not be reported as loaded.
    const bundleNames = [...new Set(declared)];
    const extraDependencies = Object.keys(dependencies).filter((name) => !declared.includes(name));
    const dataUrl = normalizeDataUrl(options.dataUrl || DEFAULT_DATA_URL);
    const started = Date.now();
    let document = options.document ?? null;
    let catalogError = null;
    if (!document && options.fetchCatalog !== false) {
        try {
            document = await loadSearchRankings(dataUrl);
        }
        catch (error) {
            catalogError = error instanceof Error ? error.message : String(error);
        }
    }
    const catalog = {
        dataUrl,
        ok: document !== null,
        error: catalogError,
        snapshotDate: document?.snapshotDate ?? null,
        generatedAt: document?.generatedAt ?? null,
        fetchedAt: document ? Date.now() : null,
        latencyMs: Date.now() - started,
        counts: { hot: document?.rankings.hot.length ?? 0, rising: document?.rankings.rising.length ?? 0, total: document?.rankings.total.length ?? 0 },
        staleDays: document?.snapshotDate ? daysBetween(document.snapshotDate, now) : null,
    };
    if (!catalog.ok)
        findings.push({ severity: "error", code: "catalog-unreachable", subject: dataUrl, message: catalog.error ?? "榜单不可用" });
    else if ((catalog.staleDays ?? 0) > STALE_DAYS)
        findings.push({ severity: "warning", code: "catalog-stale", subject: dataUrl, message: `榜单快照已有 ${catalog.staleDays} 天` });
    const hostDir = findDshInstallDir();
    const bundles = [];
    const peers = [];
    const hostDeps = [];
    const idLayers = new Map();
    for (const name of bundleNames) {
        const official = INBOX_BUNDLES.has(name) || name.startsWith("@deepseek-ai/");
        const spec = dependencies[name] ?? "(host inbox)";
        const packageDirectory = resolvePackageDir(directory, name, hostDir);
        const packageManifest = packageDirectory ? readJsonFile(join(packageDirectory, "package.json")) : null;
        const patch = patchEntries(packageDirectory, packageManifest);
        const version = typeof packageManifest?.version === "string" ? packageManifest.version : null;
        const local = spec.startsWith("link:") || spec.startsWith("file:");
        const catalogEntry = matchCatalogEntry(document, name, spec, null);
        let error = null;
        if (!packageDirectory)
            error = "包未解析到安装目录";
        else if (!packageManifest)
            error = "package.json 不可读";
        else if (!official && !isRecord(packageManifest.dsh))
            error = "不是 DSH bundle（缺少 dsh 清单字段）";
        const enabled = official || !packageIsDisabled(profile, name, directory);
        bundles.push({ name, spec, version, kind: official ? "official" : "community", directory: packageDirectory, patchPath: patch.path, entries: patch.ids, error, enabled, local, protected: isProtectedPackage(name), catalogName: catalogEntry?.fullName ?? null, latest: null, updateAvailable: false });
        for (const id of patch.ids)
            idLayers.set(id, [...(idLayers.get(id) ?? []), name]);
        if (error)
            findings.push({ severity: official ? "warning" : "error", code: "bundle-unresolved", subject: name, message: error, detail: spec });
        if (!enabled)
            findings.push({ severity: "info", code: "bundle-disabled", subject: name, message: "用户补丁层已停用该插件" });
        if (local)
            findings.push({ severity: "info", code: "bundle-local", subject: name, message: "本地 link/file 插件不能从排行页更新", detail: spec });
        if (document && !catalogEntry && !official)
            findings.push({ severity: "info", code: "bundle-unlisted", subject: name, message: "已安装但不在当前榜单里" });
        if (packageManifest && !official) {
            for (const [dependency, range] of Object.entries(stringRecord(packageManifest.peerDependencies))) {
                const resolvedDir = resolvePackageDir(directory, dependency, hostDir);
                const resolvedManifest = resolvedDir ? readJsonFile(join(resolvedDir, "package.json")) : null;
                const resolved = typeof resolvedManifest?.version === "string" ? resolvedManifest.version : null;
                const satisfied = resolved ? satisfiesRange(resolved, range) : null;
                peers.push({ plugin: name, name: dependency, range, resolved, satisfied });
                if (satisfied === false)
                    findings.push({ severity: "warning", code: "peer-mismatch", subject: name, message: `${dependency} 声明 ${range}，解析到 ${resolved}` });
            }
            for (const [dependency, range] of Object.entries(stringRecord(packageManifest.dependencies))) {
                if (!HOST_CORE_RE.test(dependency))
                    continue;
                hostDeps.push({ plugin: name, dependency, range });
                findings.push({ severity: "warning", code: "host-core-dependency", subject: name, message: `把宿主核心包 ${dependency} 写进了 dependencies`, detail: range });
            }
        }
    }
    const duplicates = [...idLayers].filter(([, layers]) => layers.length > 1).map(([id, layers]) => ({ id, layers, count: layers.length }));
    for (const item of duplicates)
        findings.push({ severity: "error", code: "duplicate-entry", subject: item.id, message: `加载 id 出现在 ${item.layers.join(" / ")}` });
    const skills = listSkills();
    for (const skill of skills)
        if (!skill.hasManifest)
            findings.push({ severity: "warning", code: "skill-manifest-missing", subject: skill.name, message: "Skill 目录缺少 SKILL.md" });
    const multiVersion = lockfileCoreVersions(directory);
    for (const item of multiVersion)
        findings.push({ severity: "warning", code: "core-multi-version", subject: item.name, message: `锁文件里有多个版本：${item.versions.join(" / ")}` });
    const patchPath = userPatchPath(profile, directory);
    const patchState = readUserPatchState(patchPath);
    const knownIds = new Set(bundles.flatMap((bundle) => bundle.entries));
    const orphans = patchState.disables.filter((id) => !knownIds.has(id));
    for (const id of orphans)
        findings.push({ severity: "warning", code: "patch-orphan", subject: id, message: "用户补丁停用了一个当前加载层找不到的 id" });
    for (const name of extraDependencies)
        findings.push({ severity: "info", code: "extra-dependency", subject: name, message: "写在 package.json 里，但不在 dsh.profile.bundles 加载顺序中", detail: dependencies[name] });
    findings.sort((left, right) => ({ error: 0, warning: 1, info: 2 })[left.severity] - ({ error: 0, warning: 1, info: 2 })[right.severity]);
    const errors = findings.filter((item) => item.severity === "error");
    const warnings = findings.filter((item) => item.severity === "warning");
    const infos = findings.filter((item) => item.severity === "info");
    return {
        schema: DIAGNOSTIC_SCHEMA,
        profile,
        profileDir: directory,
        scannedAt: now,
        pluginVersion: pluginVersion(),
        summary: { ok: errors.length === 0, errors: errors.length, warnings: warnings.length, infos: infos.length, conflicts: duplicates.length, dependencies: peers.filter((item) => item.satisfied === false).length + multiVersion.length + hostDeps.length, catalogIssues: findings.filter((item) => item.code.startsWith("catalog-")).length, order: extraDependencies.length },
        catalog,
        inventory: { official: bundles.filter((item) => item.kind === "official").length, community: bundles.filter((item) => item.kind === "community").length, skills: skills.length, enabled: bundles.filter((item) => item.enabled).length, disabled: bundles.filter((item) => !item.enabled).length, protected: bundles.filter((item) => item.protected).length, local: bundles.filter((item) => item.local).length, updates: 0, catalogMatched: bundles.filter((item) => item.catalogName).length, missingOnDisk: bundles.filter((item) => !item.directory).length, extraDependencies },
        bundles,
        skills,
        duplicates,
        peers,
        multiVersion,
        hostDeps,
        patch: { path: patchPath, exists: existsSync(patchPath), disables: patchState.disables, forced: patchState.forced, orphans },
        findings,
    };
}
