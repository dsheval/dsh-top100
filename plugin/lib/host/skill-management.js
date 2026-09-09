/** Global Skills are shared by every profile; preserve their contents on removal. */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let skillMutationTail = Promise.resolve();
/** Keep global filesystem mutation and its profile ledger write in one transaction. */
export async function withSkillMutationLock(operation, signal) {
    const previous = skillMutationTail;
    let release;
    skillMutationTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
        signal?.throwIfAborted();
        return await operation();
    }
    finally {
        release();
    }
}
export function skillHome() {
    return resolve(process.env.DSH_HOME ?? join(homedir(), ".dsh"));
}
export function globalSkillsRoot() {
    return join(skillHome(), "skills");
}
function assertDirectory(path, label) {
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (info?.isSymbolicLink())
        throw new Error(`${label}是符号链接，已停止修改`);
    if (info && !info.isDirectory())
        throw new Error(`${label}不是目录，已停止修改`);
    return info !== undefined;
}
export function assertGlobalSkillRoot() {
    assertDirectory(skillHome(), "DSH_HOME ");
    assertDirectory(globalSkillsRoot(), "Skill 安装目录");
}
export function skillTarget(name) {
    if (!SKILL_NAME_RE.test(name))
        throw new Error("Skill 目录名无效");
    assertGlobalSkillRoot();
    const target = join(globalSkillsRoot(), name);
    assertDirectory(target, `Skill ${name} 安装目标`);
    return target;
}
/** Never follow links or read special files while inspecting untrusted content. */
export function skillContentManifest(root, ignoreGit = false) {
    if (!assertDirectory(root, "Skill 目录"))
        throw new Error("Skill 未安装");
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
            const path = join(directory, entry.name);
            const info = lstatSync(path);
            if (info.isSymbolicLink())
                throw new Error(`Skill 包含符号链接，已停止修改：${entry.name}`);
            if (ignoreGit && entry.name === ".git")
                continue;
            if (info.isDirectory())
                visit(path);
            else if (info.isFile())
                files.push(relative(root, path).replaceAll("\\", "/"));
            else
                throw new Error(`Skill 包含非普通文件，已停止修改：${entry.name}`);
        }
    };
    visit(root);
    const hash = createHash("sha256");
    for (const file of files) {
        hash.update(file);
        hash.update("\0");
        hash.update(readFileSync(join(root, file)));
        hash.update("\0");
    }
    return { digest: `sha256-${hash.digest("base64")}`, files };
}
export function inspectSkill(name, evidence) {
    const path = skillTarget(name);
    if (!lstatSync(path, { throwIfNoEntry: false })) {
        return { name, scope: "global", installed: false, path, files: [], digest: null, modificationState: "unknown" };
    }
    const manifest = skillContentManifest(path);
    // A historical file list alone cannot prove that file contents are unchanged.
    const digest = evidence?.digest;
    const knownDigest = typeof digest === "string" && /^sha256-[A-Za-z0-9+/]{43}=$/.test(digest);
    return {
        name, scope: "global", installed: true, path, ...manifest,
        modificationState: knownDigest ? digest === manifest.digest ? "unchanged" : "modified" : "unknown",
    };
}
/** Rename, rather than copy/delete, so a failed backup leaves the original intact. */
export function backupSkill(name) {
    const inspection = inspectSkill(name);
    if (!inspection.installed)
        throw new Error("Skill 未安装");
    const root = join(skillHome(), "skill-backups");
    assertDirectory(root, "Skill 备份目录");
    mkdirSync(root, { recursive: true });
    const container = mkdtempSync(join(root, `${name}-`));
    const backupPath = join(container, name);
    try {
        renameSync(inspection.path, backupPath);
    }
    catch (error) {
        try {
            rmdirSync(container);
        }
        catch { /* preserve the original rename error */ }
        throw error;
    }
    return { name, scope: "global", backupPath };
}
/** Internal rollback only. Never overwrite a Skill that appeared after backup. */
export function restoreSkillBackup(backup) {
    const target = skillTarget(backup.name);
    if (lstatSync(target, { throwIfNoEntry: false }))
        throw new Error("Skill 恢复目标已存在，原备份已保留");
    const root = join(skillHome(), "skill-backups");
    assertDirectory(root, "Skill 备份目录");
    const path = resolve(backup.backupPath);
    const parts = relative(root, path).split(sep);
    if (parts.length !== 2 || !parts[0]?.startsWith(`${backup.name}-`) || parts[0] === ".."
        || parts[1] !== backup.name || basename(path) !== backup.name)
        throw new Error("Skill 备份路径无效");
    if (!assertDirectory(dirname(path), "Skill 备份容器") || !assertDirectory(path, "Skill 备份"))
        throw new Error("Skill 备份不存在");
    skillContentManifest(path);
    renameSync(path, target);
    // Successful restoration must not be reported as failure over an empty container.
    try {
        rmdirSync(dirname(path));
    }
    catch { /* harmless empty backup container */ }
}
