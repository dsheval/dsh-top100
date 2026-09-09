/** Install a catalogued Skill without executing repository code or README commands. */

import { spawn } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { CORE_SCHEMA, load as loadYaml } from "js-yaml";
import { assertGlobalSkillRoot, backupSkill, inspectSkill, restoreSkillBackup, skillContentManifest } from "../host/skill-management.js";

const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface InstalledSkill {
  name: string;
  alreadyInstalled: boolean;
  commit: string;
  digest: string;
  files: string[];
  /** Previous global copy, including all local edits, retained after replacement. */
  backupPath?: string;
  /** Transaction ownership check; intentionally omitted from persisted provenance. */
  installationIdentity?: string;
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
  // Match the host's exact delimiter lines and YAML core scalar types.
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let data: unknown;
  try {
    data = frontmatter ? loadYaml(frontmatter[1], { schema: CORE_SCHEMA }) : null;
  } catch {
    throw new Error(`${basename(directory)}/SKILL.md 的 YAML frontmatter 无效`);
  }
  const fields = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown> : null;
  if (!fields || typeof fields.name !== "string" || fields.name.length === 0
    || typeof fields.description !== "string" || fields.description.length === 0) {
    throw new Error(`${basename(directory)}/SKILL.md 缺少 name 或 description`);
  }
  if (!SKILL_NAME_RE.test(fields.name)) {
    throw new Error(`${basename(directory)}/SKILL.md 的 name 必须使用小写字母、数字及连字符`);
  }
  for (const key of ["disableModelInvocation", "modelInvocable", "userInvocable"]) {
    if (Object.hasOwn(fields, key)) throw new Error(`${basename(directory)}/SKILL.md 使用了宿主不支持的字段 ${key}`);
  }
  for (const key of ["disable-model-invocation", "user-invocable"]) {
    if (!Object.hasOwn(fields, key)) continue;
    const value = fields[key];
    if (typeof value === "boolean" || value === 0 || value === 1
      || (typeof value === "string" && /^(?:0|1|true|false|yes|no|on|off)$/i.test(value))) continue;
    throw new Error(`${basename(directory)}/SKILL.md 的 ${key} 必须是布尔值`);
  }
}

/** Reject a linked source directory or ancestor before reading any Skill content. */
function assertSourceDirectory(checkout: string, directory: string): void {
  const path = relative(checkout, directory);
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) throw new Error("Skill 来源超出仓库目录");
  let current = checkout;
  for (const part of ["", ...path.split(sep).filter(Boolean)]) {
    current = join(current, part);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) throw new Error("Skill 来源目录包含符号链接，已拒绝安装");
    if (!info.isDirectory()) throw new Error("Skill 来源不是目录");
  }
  const realPath = relative(realpathSync(checkout), realpathSync(directory));
  if (isAbsolute(realPath) || realPath === ".." || realPath.startsWith(`..${sep}`)) throw new Error("Skill 来源超出仓库目录");
}

function ensureTargetRoot(directory: string): void {
  assertGlobalSkillRoot();
  const info = lstatSync(directory, { throwIfNoEntry: false });
  if (info?.isSymbolicLink()) throw new Error("Skill 安装目录是符号链接，已拒绝安装");
  mkdirSync(directory, { recursive: true });
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

function copySkill(source: string, targetRoot: string, preferredName: string, commit: string, replaceExisting: boolean): InstalledSkill {
  const name = preferredName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!SKILL_NAME_RE.test(name)) throw new Error(`Skill 目录名无效：${name}`);
  rejectSymlinks(source);
  const manifest = skillContentManifest(source, true);
  validateSkill(source);
  const target = join(targetRoot, name);
  const targetInfo = lstatSync(target, { throwIfNoEntry: false });
  if (targetInfo?.isSymbolicLink()) throw new Error(`Skill ${name} 安装目标是符号链接，已拒绝安装`);
  if (targetInfo && !targetInfo.isDirectory()) throw new Error(`Skill ${name} 安装目标不是目录，已拒绝安装`);
  if (targetInfo) {
    const installed = skillContentManifest(target);
    if (installed.digest === manifest.digest) {
      return { name, alreadyInstalled: true, commit, ...installed };
    }
    if (!replaceExisting) throw new Error(`Skill ${name} 已存在且内容不同；请确认全局替换并备份旧版本后重试`);
  }
  const staging = mkdtempSync(join(targetRoot, `.${name}-`));
  let backupPath: string | undefined;
  try {
    cpSync(source, staging, {
      recursive: true,
      filter: (path) => basename(path) !== ".git",
    });
    if (targetInfo) backupPath = backupSkill(name).backupPath;
    renameSync(staging, target);
  } catch (error) {
    // Restoration must still run if a read-only staging file prevents cleanup.
    let cleanupError: unknown;
    try { rmSync(staging, { recursive: true, force: true }); }
    catch (caught) { cleanupError = caught; }
    if (backupPath) {
      try { restoreSkillBackup({ name, scope: "global", backupPath }); }
      catch (restoreError) {
        throw new Error(`Skill ${name} 替换失败且自动恢复失败；原文件保留在 ${backupPath}：${String(restoreError)}`, { cause: error });
      }
    }
    if (cleanupError) throw new Error(`Skill ${name} 安装失败，临时目录待清理 ${staging}：${String(cleanupError)}`, { cause: error });
    throw error;
  }
  const identity = lstatSync(target);
  return {
    name, alreadyInstalled: false, commit, ...manifest,
    installationIdentity: `${identity.dev}:${identity.ino}`,
    ...(backupPath ? { backupPath } : {}),
  };
}

/** Undo this transaction without treating rollback as a user-requested uninstall. */
export function rollbackInstalledSkill(skill: InstalledSkill): void {
  if (skill.alreadyInstalled) return;
  const current = inspectSkill(skill.name, { digest: skill.digest });
  const identity = lstatSync(current.path, { throwIfNoEntry: false });
  if (current.installed && (current.modificationState !== "unchanged"
    || (skill.installationIdentity && `${identity?.dev}:${identity?.ino}` !== skill.installationIdentity))) {
    throw new Error(`Skill ${skill.name} 安装后内容发生变化，已保留当前文件及原备份，停止自动回滚${skill.backupPath ? `；原内容备份：${skill.backupPath}` : ""}`);
  }
  if (!skill.backupPath) {
    if (current.installed) rmSync(current.path, { recursive: true, force: true });
    return;
  }
  const holding = mkdtempSync(join(dirname(current.path), `.${skill.name}-rollback-`));
  const saved = join(holding, skill.name);
  let restored = false;
  try {
    if (current.installed) renameSync(current.path, saved);
    try {
      restoreSkillBackup({ name: skill.name, scope: "global", backupPath: skill.backupPath });
      restored = true;
    } catch (error) {
      if (current.installed) renameSync(saved, current.path);
      throw error;
    }
  } finally {
    // If restoring the temporary current copy fails, preserve it for recovery.
    if (restored || !lstatSync(saved, { throwIfNoEntry: false })) {
      rmSync(holding, { recursive: true, force: true });
    }
  }
}

function copySkills(
  candidates: Array<{ source: string; name: string }>,
  checkout: string,
  targetRoot: string,
  commit: string,
  replaceExisting: boolean,
  signal?: AbortSignal,
): InstalledSkill[] {
  const installed: InstalledSkill[] = [];
  try {
    for (const candidate of candidates) {
      signal?.throwIfAborted();
      assertSourceDirectory(checkout, candidate.source);
      installed.push(copySkill(candidate.source, targetRoot, candidate.name, commit, replaceExisting));
    }
    signal?.throwIfAborted();
    return installed;
  } catch (error) {
    const failures: string[] = [];
    for (const skill of [...installed].reverse()) {
      try { rollbackInstalledSkill(skill); }
      catch (rollbackError) { failures.push(String(rollbackError)); }
    }
    if (failures.length) throw new Error(`Skill 安装失败，部分文件无法自动恢复：${failures.join("；")}`, { cause: error });
    throw error;
  }
}

async function githubJson(url: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "dsh-top100-plugin" };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]) });
  if (!response.ok) throw new Error(`Skill 来源验证失败：${response.status} ${response.statusText || "request failed"}`);
  const payload: unknown = await response.json();
  signal?.throwIfAborted();
  return payload;
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
  options: { signal?: AbortSignal; commit?: string; replaceExisting?: boolean } = {},
): Promise<InstalledSkill[]> {
  if (!FULL_NAME_RE.test(fullName)) throw new Error("Skill 来源必须是 owner/repo");
  const temporary = mkdtempSync(join(tmpdir(), "dsh-top100-skill-"));
  const checkout = join(temporary, "repo");
  const targetRoot = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "skills");
  try {
    ensureTargetRoot(targetRoot);
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
      }], checkout, targetRoot, source.commit, options.replaceExisting === true, options.signal);
    }
    const skillsRoot = ["skills", "skill"]
      .map((name) => join(checkout, name))
      .find((path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined);
    if (!skillsRoot) throw new Error("仓库根目录及 skills/ 下均未找到 SKILL.md");
    assertSourceDirectory(checkout, skillsRoot);
    rejectSymlinks(skillsRoot);
    const candidates = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")));
    if (candidates.length === 0) throw new Error("skills/ 下没有可安装的直接子目录");
    options.signal?.throwIfAborted();
    return copySkills(
      candidates.map((entry) => ({ source: join(skillsRoot, entry.name), name: entry.name })),
      checkout,
      targetRoot,
      source.commit,
      options.replaceExisting === true,
      options.signal,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
