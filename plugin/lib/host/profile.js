/** Read the current DSH profile's installed packages. */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
export const INBOX_BUNDLES = new Set([
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "@deepseek-ai/dsh-headless",
]);
/** Match DSH's own profile directory-name rules (dots, spaces, and Unicode are valid). */
export function isDshProfileName(profile) {
    return profile !== ""
        && profile !== "."
        && profile !== ".."
        && profile !== "node_modules"
        && !profile.includes("/")
        && !profile.includes("\\")
        && !profile.includes("\0");
}
export function profileDir(profile, explicitDir) {
    if (explicitDir !== undefined)
        return explicitDir;
    if (!isDshProfileName(profile))
        throw new Error(`dsh-top100: invalid profile name ${JSON.stringify(profile)}`);
    const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
    return join(home, "profiles", profile);
}
export function readInstalled(profile, explicitDir) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "package.json"), "utf8"));
        const installed = {};
        for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
            if (!INBOX_BUNDLES.has(name))
                installed[name] = spec;
        }
        return installed;
    }
    catch {
        return {};
    }
}
function objectRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function writeManifestAtomic(path, manifest) {
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
}
/** Capture every profile file or field that a package operation may mutate. */
export function readProfileManifestSnapshot(profile, explicitDir) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "package.json"), "utf8"));
        const profileManifest = objectRecord(manifest.dsh?.profile);
        const present = profileManifest !== undefined && Object.hasOwn(profileManifest, "bundles");
        const lockPath = join(profileDir(profile, explicitDir), "pnpm-lock.yaml");
        let lockfile = { present: false };
        try {
            lockfile = { present: true, value: readFileSync(lockPath, "utf8") };
        }
        catch { /* absent */ }
        const workspacePath = join(profileDir(profile, explicitDir), "pnpm-workspace.yaml");
        let workspace = { present: false };
        try {
            workspace = { present: true, value: readFileSync(workspacePath, "utf8") };
        }
        catch { /* absent */ }
        return {
            dependencies: { ...manifest.dependencies },
            profileBundles: present
                ? { present: true, value: structuredClone(profileManifest.bundles) }
                : { present: false },
            lockfile,
            workspace,
        };
    }
    catch {
        return {
            dependencies: {},
            profileBundles: { present: false },
            lockfile: { present: false },
            workspace: { present: false },
        };
    }
}
/** Restore only the manifest fields owned by a failed package operation. */
export function restoreProfileManifest(profile, snapshot, explicitDir) {
    const path = join(profileDir(profile, explicitDir), "package.json");
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return [];
    }
    const currentDependencies = manifest.dependencies ?? {};
    const changed = new Set();
    for (const name of new Set([...Object.keys(currentDependencies), ...Object.keys(snapshot.dependencies)])) {
        if (currentDependencies[name] !== snapshot.dependencies[name])
            changed.add(name);
    }
    const dsh = objectRecord(manifest.dsh);
    const profileManifest = objectRecord(dsh?.profile);
    const currentBundles = profileManifest !== undefined && Object.hasOwn(profileManifest, "bundles")
        ? { present: true, value: profileManifest.bundles }
        : { present: false };
    const bundlesChanged = currentBundles.present !== snapshot.profileBundles.present
        || (currentBundles.present && snapshot.profileBundles.present
            && !isDeepStrictEqual(currentBundles.value, snapshot.profileBundles.value));
    if (bundlesChanged)
        changed.add("dsh.profile.bundles");
    const lockPath = join(profileDir(profile, explicitDir), "pnpm-lock.yaml");
    let currentLock = null;
    try {
        currentLock = readFileSync(lockPath, "utf8");
    }
    catch { /* absent */ }
    const lockChanged = snapshot.lockfile.present
        ? currentLock !== snapshot.lockfile.value
        : currentLock !== null;
    if (lockChanged)
        changed.add("pnpm-lock.yaml");
    const workspacePath = join(profileDir(profile, explicitDir), "pnpm-workspace.yaml");
    let currentWorkspace = null;
    try {
        currentWorkspace = readFileSync(workspacePath, "utf8");
    }
    catch { /* absent */ }
    const workspaceChanged = snapshot.workspace.present
        ? currentWorkspace !== snapshot.workspace.value
        : currentWorkspace !== null;
    if (workspaceChanged)
        changed.add("pnpm-workspace.yaml");
    if (changed.size === 0)
        return [];
    manifest.dependencies = { ...snapshot.dependencies };
    if (snapshot.profileBundles.present) {
        const nextDsh = dsh ?? {};
        const nextProfile = profileManifest ?? {};
        manifest.dsh = nextDsh;
        nextDsh.profile = nextProfile;
        nextProfile.bundles = structuredClone(snapshot.profileBundles.value);
    }
    else if (profileManifest !== undefined) {
        delete profileManifest.bundles;
    }
    writeManifestAtomic(path, manifest);
    if (lockChanged) {
        if (snapshot.lockfile.present) {
            const temporary = `${lockPath}.${process.pid}.${Date.now()}.tmp`;
            writeFileSync(temporary, snapshot.lockfile.value, "utf8");
            renameSync(temporary, lockPath);
        }
        else if (existsSync(lockPath)) {
            unlinkSync(lockPath);
        }
    }
    if (workspaceChanged) {
        if (snapshot.workspace.present) {
            const temporary = `${workspacePath}.${process.pid}.${Date.now()}.tmp`;
            writeFileSync(temporary, snapshot.workspace.value, "utf8");
            renameSync(temporary, workspacePath);
        }
        else if (existsSync(workspacePath)) {
            unlinkSync(workspacePath);
        }
    }
    return [...changed];
}
/** Finish a half-uninstall when the package is already gone from disk. */
export function dropFromManifest(profile, name, explicitDir) {
    const path = join(profileDir(profile, explicitDir), "package.json");
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return false;
    }
    let changed = false;
    if (manifest.dependencies?.[name] !== undefined) {
        delete manifest.dependencies[name];
        changed = true;
    }
    const bundles = manifest.dsh?.profile?.bundles;
    if (Array.isArray(bundles) && bundles.includes(name)) {
        manifest.dsh.profile.bundles = bundles.filter((bundle) => bundle !== name);
        changed = true;
    }
    if (changed)
        writeManifestAtomic(path, manifest);
    return changed;
}
export function readInstalledVersion(profile, name, explicitDir) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "node_modules", name, "package.json"), "utf8"));
        return manifest.version ?? null;
    }
    catch {
        return null;
    }
}
export function readInstalledManifest(profile, name, explicitDir) {
    try {
        return JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "node_modules", name, "package.json"), "utf8"));
    }
    catch {
        return null;
    }
}
export function argvProfile(argv = process.argv) {
    const flag = argv.indexOf("--profile");
    if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith("-")) {
        return argv[flag + 1];
    }
    return undefined;
}
export function resolveActiveProfile(configured, argv = process.argv) {
    return configured?.trim() || argvProfile(argv) || "web";
}
