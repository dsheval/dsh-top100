/** Install a catalogued Skill without executing repository code or README commands. */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface InstalledSkill {
  name: string;
  alreadyInstalled: boolean;
  commit: string;
  digest: string;
  files: string[];
}

export interface VerifiedSkillSource {
  fullName: string;
  repositoryUrl: string;
  commit: string;
  verifiedAt: number;
}

function runGit(args: string[], signal?: AbortSignal, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
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
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git clone exited with ${String(code)}`));
    });
  });
}

function validateSkill(directory: string): void {
  const manifest = join(directory, "SKILL.md");
  if (!existsSync(manifest)) throw new Error(`缺少 ${manifest}`);
  const text = readFileSync(manifest, "utf8");
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter || !/^name:\s*\S+/m.test(frontmatter[1]) || !/^description:\s*\S+/m.test(frontmatter[1])) {
    throw new Error(`${basename(directory)}/SKILL.md 缺少 name 或 description`);
  }
}

function rejectSymlinks(path: string): void {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (lstatSync(child).isSymbolicLink()) {
      throw new Error(`Skill 包含符号链接，已拒绝安装：${entry.name}`);
    }
    if (entry.isDirectory() && entry.name !== ".git") rejectSymlinks(child);
  }
}

function contentManifest(root: string): { digest: string; files: string[] } {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === ".git") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
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

function copySkill(source: string, targetRoot: string, preferredName: string, commit: string): InstalledSkill {
  const name = preferredName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!SKILL_NAME_RE.test(name)) throw new Error(`Skill 目录名无效：${name}`);
  validateSkill(source);
  rejectSymlinks(source);
  const manifest = contentManifest(source);
  const target = join(targetRoot, name);
  if (existsSync(target)) {
    rejectSymlinks(target);
    const installed = contentManifest(target);
    if (installed.digest !== manifest.digest) {
      throw new Error(`Skill ${name} 已存在且内容与已确认 commit 不同；请先备份并卸载旧版本`);
    }
    return { name, alreadyInstalled: true, commit, ...installed };
  }
  const staging = join(targetRoot, `.${name}.${process.pid}.${Date.now()}.tmp`);
  try {
    cpSync(source, staging, {
      recursive: true,
      filter: (path) => basename(path) !== ".git",
    });
    renameSync(staging, target);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { name, alreadyInstalled: false, commit, ...manifest };
}

function copySkills(
  candidates: Array<{ source: string; name: string }>,
  targetRoot: string,
  commit: string,
  signal?: AbortSignal,
): InstalledSkill[] {
  const installed: InstalledSkill[] = [];
  try {
    for (const candidate of candidates) {
      signal?.throwIfAborted();
      installed.push(copySkill(candidate.source, targetRoot, candidate.name, commit));
    }
    return installed;
  } catch (error) {
    for (const skill of [...installed].reverse()) {
      if (!skill.alreadyInstalled) rmSync(join(targetRoot, skill.name), { recursive: true, force: true });
    }
    throw error;
  }
}

async function githubJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "dsh-top100-plugin" };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: signal ?? AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Skill 来源验证失败：${response.status} ${response.statusText || "request failed"}`);
  return response.json();
}

export async function verifySkillSource(fullName: string, signal?: AbortSignal): Promise<VerifiedSkillSource> {
  if (!FULL_NAME_RE.test(fullName)) throw new Error("Skill 来源必须是 owner/repo");
  const repository = await githubJson(`https://api.github.com/repos/${fullName}`, signal) as { default_branch?: unknown };
  const branch = typeof repository.default_branch === "string" ? repository.default_branch : "main";
  const commitPayload = await githubJson(
    `https://api.github.com/repos/${fullName}/commits/${encodeURIComponent(branch)}`,
    signal,
  ) as { sha?: unknown };
  const commit = typeof commitPayload.sha === "string" && /^[0-9a-f]{40}$/i.test(commitPayload.sha)
    ? commitPayload.sha.toLowerCase()
    : null;
  if (!commit) throw new Error("Skill 来源无法解析到不可变 commit");
  return { fullName, repositoryUrl: `https://github.com/${fullName}`, commit, verifiedAt: Date.now() };
}

export async function installSkill(
  fullName: string,
  options: { signal?: AbortSignal; commit?: string } = {},
): Promise<InstalledSkill[]> {
  if (!FULL_NAME_RE.test(fullName)) throw new Error("Skill 来源必须是 owner/repo");
  const temporary = mkdtempSync(join(tmpdir(), "dsh-top100-skill-"));
  const checkout = join(temporary, "repo");
  const targetRoot = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "skills");
  mkdirSync(targetRoot, { recursive: true });
  try {
    const source = options.commit
      ? { commit: options.commit }
      : await verifySkillSource(fullName, options.signal);
    if (!/^[0-9a-f]{40}$/i.test(source.commit)) throw new Error("Skill commit 格式无效");
    mkdirSync(checkout, { recursive: true });
    await runGit(["init", "--quiet"], options.signal, checkout);
    await runGit(["remote", "add", "origin", `https://github.com/${fullName}.git`], options.signal, checkout);
    await runGit(["fetch", "--depth", "1", "origin", source.commit], options.signal, checkout);
    await runGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], options.signal, checkout);
    options.signal?.throwIfAborted();
    const rootManifest = join(checkout, "SKILL.md");
    if (existsSync(rootManifest)) {
      return copySkills([{
        source: checkout,
        name: fullName.split("/")[1] ?? fullName,
      }], targetRoot, source.commit, options.signal);
    }
    const skillsRoot = ["skills", "skill"]
      .map((name) => join(checkout, name))
      .find((path) => existsSync(path));
    if (!skillsRoot) throw new Error("仓库根目录及 skills/ 下均未找到 SKILL.md");
    const candidates = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")));
    if (candidates.length === 0) throw new Error("skills/ 下没有可安装的直接子目录");
    options.signal?.throwIfAborted();
    return copySkills(
      candidates.map((entry) => ({ source: join(skillsRoot, entry.name), name: entry.name })),
      targetRoot,
      source.commit,
      options.signal,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
