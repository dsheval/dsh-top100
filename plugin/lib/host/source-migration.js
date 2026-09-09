/** Explicitly pin existing npm tags without resolving, downloading or upgrading any package. */
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { dump, JSON_SCHEMA, load } from "js-yaml";
import { valid } from "semver";
import { npmPackageSpec } from "../install/install-spec.js";
import { parseNpmSelector } from "../install/npm-selector.js";
import { profileDir } from "./profile.js";
import { renderBundleProvenance } from "./provenance.js";
const approvals = new Map();
const TTL_MS = 10 * 60 * 1000;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const pathExists = (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
function snapshot(path, writable = false, optional = false) {
    let entry;
    try {
        entry = lstatSync(path);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw new Error("无法读取 Profile 元数据，已停止迁移");
        if (!optional)
            throw new Error(`缺少 ${path.endsWith("pnpm-lock.yaml") ? "pnpm-lock.yaml" : "必要的安装文件"}，无法安全固定当前版本`);
        return { path, content: null, hash: null, realPath: null, mode: 0o600, writable };
    }
    if (writable && entry.isSymbolicLink())
        throw new Error("Profile 元数据使用符号链接，无法安全执行来源迁移");
    if (!statSync(path).isFile())
        throw new Error("Profile 元数据不是普通文件，无法安全执行来源迁移");
    const content = readFileSync(path);
    return { path, content, hash: hash(content), realPath: realpathSync(path), mode: statSync(path).mode & 0o777, writable };
}
function assertSnapshots(snapshots) {
    for (const before of snapshots) {
        const current = snapshot(before.path, before.writable, before.content === null);
        if (current.hash !== before.hash || current.realPath !== before.realPath || current.mode !== before.mode) {
            throw new Error("Profile 配置、锁文件或已安装插件在确认前发生变化，请重新检查");
        }
    }
}
function parseJson(snapshot) {
    try {
        const value = JSON.parse(snapshot.content.toString("utf8"));
        if (record(value))
            return value;
    }
    catch { /* Never quote raw local configuration. */ }
    throw new Error("Profile 或插件 package.json 损坏，无法安全迁移");
}
function parseYaml(snapshot) {
    try {
        const value = load(snapshot.content.toString("utf8"), { schema: JSON_SCHEMA });
        if (record(value))
            return JSON.parse(JSON.stringify(value));
    }
    catch { /* Reject custom YAML tags, duplicate keys and cyclic aliases without exposing values. */ }
    throw new Error("Profile 的 YAML 配置损坏或含不支持的格式，无法安全迁移");
}
function removeExpired() {
    for (const [token, approval] of approvals)
        if (approval.preflight.expiresAt <= Date.now())
            approvals.delete(token);
}
export function preflightSourceMigration(profile, explicitDir) {
    removeExpired();
    const directory = realpathSync(resolve(profileDir(profile, explicitDir)));
    const snapshots = [];
    const read = (path, writable = false, optional = false) => {
        const value = snapshot(path, writable, optional);
        snapshots.push(value);
        return value;
    };
    // A shared ancestor workspace can select a different importer or lockfile.
    for (let ancestor = dirname(directory);; ancestor = dirname(ancestor)) {
        if (read(join(ancestor, "pnpm-workspace.yaml"), false, true).content !== null)
            throw new Error("当前 Profile 属于外部 workspace，请先按原工作区方式固定依赖");
        if (dirname(ancestor) === ancestor)
            break;
    }
    const manifestFile = read(join(directory, "package.json"), true);
    const lockFile = read(join(directory, "pnpm-lock.yaml"), true);
    const ledgerDirectory = join(directory, ".dsh-top100");
    const ledgerDirectoryStat = lstatSync(ledgerDirectory, { throwIfNoEntry: false });
    if (ledgerDirectoryStat && (ledgerDirectoryStat.isSymbolicLink() || !ledgerDirectoryStat.isDirectory())) {
        throw new Error("安装来源台账目录不是当前 Profile 的普通目录，无法安全迁移");
    }
    const ledgerFile = read(join(ledgerDirectory, "provenance.json"), true, true);
    const workspaceFile = read(join(directory, "pnpm-workspace.yaml"), false, true);
    const npmrcFile = read(join(directory, ".npmrc"), false, true);
    if (npmrcFile.content && /^\s*(?:pnpmfile|global-pnpmfile|lockfile-dir|shared-workspace-lockfile|ignore-pnpmfile|overrides(?:\[|\.)|workspace-dir)\s*(?:=|\[|\.)/im.test(npmrcFile.content.toString("utf8"))) {
        throw new Error("Profile .npmrc 含自定义锁文件或 hook 配置，无法安全迁移");
    }
    for (const filename of [".pnpmfile.cjs", ".pnpmfile.mjs"]) {
        if (read(join(directory, filename), false, true).content !== null)
            throw new Error("Profile 使用自定义 pnpm hook，请先按原安装方式固定依赖");
    }
    if (workspaceFile.content !== null) {
        const workspace = parseYaml(workspaceFile);
        const supported = new Set(["packages", "allowBuilds", "nodeLinker", "autoInstallPeers", "minimumReleaseAgeExclude"]);
        if (Object.keys(workspace).some((key) => !supported.has(key))
            || (workspace.packages !== undefined && (!Array.isArray(workspace.packages) || workspace.packages.some((path) => path !== ".")))) {
            throw new Error("Profile 的 workspace 配置超出单 Profile 迁移范围，请先按原安装方式固定依赖");
        }
    }
    const manifest = parseJson(manifestFile);
    const lock = parseYaml(lockFile);
    if (["devDependencies", "optionalDependencies"].some((section) => record(manifest[section])
        && Object.values(manifest[section]).some((spec) => typeof spec === "string" && parseNpmSelector(spec)?.kind === "tag"))) {
        throw new Error("devDependencies 或 optionalDependencies 存在动态频道，超出本次迁移范围；请按原安装方式先固定这些依赖");
    }
    if (manifest.workspaces !== undefined || (record(manifest.pnpm) && Object.keys(manifest.pnpm).length)) {
        throw new Error("Profile 含 workspace 或自定义 pnpm 配置，无法安全迁移");
    }
    if (!["9.0", 9].includes(lock.lockfileVersion) || !record(lock.importers)
        || Object.keys(lock.importers).length !== 1 || !record(lock.importers["."])
        || lock.overrides !== undefined || lock.pnpmfileChecksum !== undefined) {
        throw new Error("仅支持当前 Profile 独立的 pnpm lockfile v9 和单一根 importer，请先按原安装方式固定依赖");
    }
    const dependencies = manifest.dependencies ?? {};
    const lockedDependencies = lock.importers["."].dependencies ?? {};
    if (!record(dependencies) || !record(lockedDependencies)
        || !isDeepStrictEqual(Object.keys(dependencies).sort(), Object.keys(lockedDependencies).sort())) {
        throw new Error("Profile dependencies 与锁文件不一致，请先修复安装");
    }
    const items = [];
    const evidence = [];
    for (const [name, from] of Object.entries(dependencies)) {
        if (npmPackageSpec(name)?.name !== name || typeof from !== "string" || !record(lockedDependencies[name])
            || lockedDependencies[name].specifier !== from)
            throw new Error("Profile dependencies 与锁文件安装来源不一致，请先修复安装");
        if (parseNpmSelector(from)?.kind !== "tag")
            continue;
        const installed = parseJson(read(join(directory, "node_modules", name, "package.json")));
        const version = installed.version;
        const locked = lockedDependencies[name].version;
        if (installed.name !== name || typeof version !== "string" || !valid(version)
            || valid(version) !== version || typeof locked !== "string" || locked.split("(")[0] !== version) {
            throw new Error(`${name} 的当前安装版本与锁文件无法核对，请先修复安装`);
        }
        const integrity = lock.packages?.[`${name}@${version}`]?.resolution?.integrity;
        if (typeof integrity !== "string" || !integrity.trim())
            throw new Error(`${name} 的锁文件缺少可核对的安装摘要，无法安全记录来源`);
        items.push({ name, from, version });
        dependencies[name] = version;
        lockedDependencies[name].specifier = version;
        evidence.push({
            approvalToken: "existing-install-migration", expiresAt: 0, fullName: name, profile, kind: "bundle",
            provenance: { source: "npm", requestedTarget: `${name}@${from}`, resolvedTarget: `${name}@${version}`, packageName: name,
                version, commit: null, integrity, repositoryUrl: null, repositoryIdentity: "unavailable", verifiedAt: Date.now(), verification: "local-existing-install" },
            lifecycleScripts: [], risks: [{ code: "repository-identity", severity: "warning", summary: "来源记录来自既有安装",
                    detail: "仅核对当前已安装包与本地锁文件，未重新验证远端仓库；后续更新仍需重新验证目标来源。" }],
            requiresExplicitApproval: true, activationExpectation: "unknown",
        });
    }
    let ledgerContent;
    try {
        ledgerContent = renderBundleProvenance({ profile, profileDirectory: directory, dataUrl: "" }, evidence);
    }
    catch {
        throw new Error("已有安装来源台账损坏或无法安全读取，已停止迁移");
    }
    const changes = items.length ? [
        { before: manifestFile, content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) },
        { before: lockFile, content: Buffer.from(dump(lock, { schema: JSON_SCHEMA, lineWidth: -1, noRefs: true })) },
        { before: ledgerFile, content: Buffer.from(ledgerContent) },
    ] : [];
    assertSnapshots(snapshots);
    const preflight = { approvalToken: randomUUID(), expiresAt: Date.now() + TTL_MS, items };
    approvals.set(preflight.approvalToken, { profile, directory, preflight, snapshots, changes });
    return structuredClone(preflight);
}
export function applySourceMigration(token, profile, explicitDir) {
    removeExpired();
    const approval = approvals.get(token);
    if (!approval)
        throw new Error("来源迁移确认已过期，请重新检查");
    if (approval.profile !== profile || approval.directory !== realpathSync(resolve(profileDir(profile, explicitDir)))) {
        throw new Error("来源迁移确认与当前 Profile 不匹配");
    }
    assertSnapshots(approval.snapshots);
    approvals.delete(token);
    const staged = [];
    const createdDirectories = [];
    try {
        for (const change of approval.changes) {
            const parent = dirname(change.before.path);
            if (!existsSync(parent)) {
                mkdirSync(parent);
                createdDirectories.push(parent);
            }
            if (lstatSync(parent).isSymbolicLink() || realpathSync(parent) !== parent)
                throw new Error("Profile 目录在迁移前发生变化，请重新检查");
            const entry = { path: change.before.path, temporary: `${change.before.path}.${randomUUID()}.tmp`, backup: `${change.before.path}.${randomUUID()}.bak`,
                before: change.before, expectedHash: hash(change.content), hadOriginal: change.before.content !== null, movedOriginal: false, published: false };
            staged.push(entry);
            writeFileSync(entry.temporary, change.content, { flag: "wx", mode: change.before.mode });
            chmodSync(entry.temporary, change.before.mode);
        }
        assertSnapshots(approval.snapshots);
        for (const entry of staged) {
            assertSnapshots([entry.before]);
            if (entry.hadOriginal) {
                renameSync(entry.path, entry.backup);
                entry.movedOriginal = true;
            }
            if (pathExists(entry.path))
                throw new Error("迁移期间存在外部文件修改");
            renameSync(entry.temporary, entry.path);
            entry.published = true;
        }
        for (const entry of staged) {
            const current = snapshot(entry.path, true);
            if (current.hash !== entry.expectedHash || current.mode !== entry.before.mode)
                throw new Error("迁移期间存在外部文件修改");
        }
    }
    catch {
        let restored = true;
        for (const entry of [...staged].reverse()) {
            try {
                if (entry.movedOriginal) {
                    const current = pathExists(entry.path) ? snapshot(entry.path, true) : null;
                    const ours = entry.published && current?.hash === entry.expectedHash && current.mode === entry.before.mode;
                    if (ours || (!entry.published && !pathExists(entry.path)))
                        renameSync(entry.backup, entry.path);
                    else
                        restored = false; // Keep both external changes and the original backup.
                }
                else if (entry.published) {
                    const current = pathExists(entry.path) ? snapshot(entry.path, true) : null;
                    if (current?.hash === entry.expectedHash && current.mode === entry.before.mode)
                        rmSync(entry.path);
                    else
                        restored = false;
                }
                rmSync(entry.temporary, { force: true });
            }
            catch {
                restored = false;
            }
        }
        for (const directory of createdDirectories.reverse()) {
            try {
                rmdirSync(directory);
            }
            catch { /* Keep nonempty directories, including recovery backups. */ }
        }
        throw new Error(restored ? "来源迁移写入失败，已恢复原文件；请重新检查后重试" : "来源迁移写入失败且自动恢复未完成，请保留 Profile 中的备份文件并检查目录权限");
    }
    for (const entry of staged)
        if (entry.movedOriginal) {
            try {
                rmSync(entry.backup);
            }
            catch { /* A harmless backup is preferable to reverting a completed transaction. */ }
        }
    return { items: structuredClone(approval.preflight.items), migrated: approval.preflight.items.length };
}
