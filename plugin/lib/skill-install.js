/** Install a catalogued Skill without executing repository code or README commands. */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function runGit(args, signal) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", args, {
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            signal,
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
            stderr = (stderr + chunk.toString()).slice(-8 * 1024);
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(stderr.trim() || `git clone exited with ${String(code)}`));
        });
    });
}

function validateSkill(directory) {
    const manifest = join(directory, "SKILL.md");
    if (!existsSync(manifest))
        throw new Error(`缺少 ${manifest}`);
    const text = readFileSync(manifest, "utf8");
    const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatter || !/^name:\s*\S+/m.test(frontmatter[1]) || !/^description:\s*\S+/m.test(frontmatter[1]))
        throw new Error(`${basename(directory)}/SKILL.md 缺少 name 或 description`);
}

function rejectSymlinks(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (lstatSync(child).isSymbolicLink())
            throw new Error(`Skill 包含符号链接，已拒绝安装：${entry.name}`);
        if (entry.isDirectory() && entry.name !== ".git")
            rejectSymlinks(child);
    }
}

function copySkill(source, targetRoot, preferredName) {
    const name = preferredName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!SKILL_NAME_RE.test(name))
        throw new Error(`Skill 目录名无效：${name}`);
    const target = join(targetRoot, name);
    if (existsSync(target))
        return { name, alreadyInstalled: true };
    validateSkill(source);
    rejectSymlinks(source);
    cpSync(source, target, {
        recursive: true,
        filter: (path) => basename(path) !== ".git",
    });
    return { name, alreadyInstalled: false };
}

export async function installSkill(fullName, options = {}) {
    if (!FULL_NAME_RE.test(fullName))
        throw new Error("Skill 来源必须是 owner/repo");
    const temporary = mkdtempSync(join(tmpdir(), "dsh-top100-skill-"));
    const checkout = join(temporary, "repo");
    const targetRoot = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "skills");
    mkdirSync(targetRoot, { recursive: true });
    try {
        await runGit(["clone", "--depth", "1", `https://github.com/${fullName}.git`, checkout], options.signal);
        options.signal?.throwIfAborted();
        const rootManifest = join(checkout, "SKILL.md");
        if (existsSync(rootManifest)) {
            return [copySkill(checkout, targetRoot, fullName.split("/")[1])];
        }
        const skillsRoot = ["skills", "skill"]
            .map((name) => join(checkout, name))
            .find((path) => existsSync(path));
        if (!skillsRoot)
            throw new Error("仓库根目录及 skills/ 下均未找到 SKILL.md");
        const candidates = readdirSync(skillsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")));
        if (candidates.length === 0)
            throw new Error("skills/ 下没有可安装的直接子目录");
        options.signal?.throwIfAborted();
        return candidates.map((entry) => copySkill(join(skillsRoot, entry.name), targetRoot, entry.name));
    }
    finally {
        rmSync(temporary, { recursive: true, force: true });
    }
}
