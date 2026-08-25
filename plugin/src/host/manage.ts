/** List and mutate installed profile plugins and local skills. */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findEntry } from "./catalog.js";
import { NPM_SPEC_RE } from "../install/install-spec.js";
import { isProtectedPackage, packageIsDisabled, removeRowBlocks, rowIdsForPackage, userPatchPath } from "./patch-toggle.js";
import { readInstalled, readInstalledManifest, readInstalledVersion } from "./profile.js";
import { compareSemver } from "./semver.js";
import type { ManagedPlugin, RankingsDocument } from "../shared/types.js";

const UPDATE_CACHE_MS = 5 * 60 * 1000;
const latestCache = new Map<string, { version: string | null; fetchedAt: number }>();

export function skillsRoot(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "skills");
}

function repositoryUrl(repository: unknown): string | null {
  if (typeof repository === "string") return repository;
  if (repository !== null && typeof repository === "object" && typeof (repository as { url?: unknown }).url === "string") {
    return (repository as { url: string }).url;
  }
  return null;
}

function githubFullName(spec: string, repository: unknown): string | null {
  const fromSpec = spec.match(/^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  if (fromSpec) return fromSpec[1];
  const fromUrl = repositoryUrl(repository)?.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/i);
  return fromUrl?.[1] ?? null;
}

export function matchCatalogEntry(document: RankingsDocument | null, name: string, spec: string, fullName: string | null) {
  if (!document) return undefined;
  if (fullName) {
    const exact = findEntry(document, fullName);
    if (exact) return exact;
  }
  return document.rankings.total.find((entry) => {
    const haystack = `${entry.fullName} ${entry.name} ${entry.install?.target ?? ""}`.toLowerCase();
    return haystack.includes(name.toLowerCase()) || (fullName !== null && haystack.includes(fullName.toLowerCase()));
  });
}

export async function fetchNpmLatest(name: string): Promise<string | null> {
  const cached = latestCache.get(name);
  if (cached && Date.now() - cached.fetchedAt < UPDATE_CACHE_MS) return cached.version;
  try {
    const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
    const response = await fetch(`https://registry.npmjs.org/${encoded}/latest`, {
      headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as { version?: unknown };
    const version = typeof body.version === "string" ? body.version : null;
    latestCache.set(name, { version, fetchedAt: Date.now() });
    return version;
  } catch {
    latestCache.set(name, { version: null, fetchedAt: Date.now() });
    return null;
  }
}

function updateAvailable(current: string | null, latest: string | null): boolean {
  return Boolean(current && latest && compareSemver(current.replace(/^v/, ""), latest.replace(/^v/, "")) < 0);
}

export function resolveUpdateTarget(name: string, spec: string): string | null {
  if (spec.startsWith("link:") || spec.startsWith("file:")) return null;
  if (spec.startsWith("github:")) return spec.replace(/#.*$/, "");
  if (NPM_SPEC_RE.test(name)) return `${name}@latest`;
  return null;
}

function listSkills(): ManagedPlugin[] {
  const root = skillsRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    let description = "";
    try { description = /^description:\s*(.+)$/m.exec(readFileSync(join(root, entry.name, "SKILL.md"), "utf8"))?.[1]?.trim() ?? ""; } catch { /* no manifest */ }
    return {
      name: entry.name,
      spec: `skill:${entry.name}`,
      version: null,
      description,
      descriptionZh: description,
      fullName: null,
      url: null,
      enabled: true,
      updateAvailable: false,
      latest: null,
      local: true,
      protected: false,
      kind: "skill" as const,
    };
  });
}

export async function listManagedPlugins(profile: string, document: RankingsDocument | null): Promise<ManagedPlugin[]> {
  const plugins = await Promise.all(Object.entries(readInstalled(profile)).map(async ([name, spec]) => {
    const manifest = readInstalledManifest(profile, name);
    const fullName = githubFullName(spec, manifest?.repository);
    const catalog = matchCatalogEntry(document, name, spec, fullName);
    const version = readInstalledVersion(profile, name);
    const local = spec.startsWith("link:") || spec.startsWith("file:");
    const latest = local || spec.startsWith("github:") ? null : await fetchNpmLatest(name);
    return {
      name,
      spec,
      version,
      description: catalog?.descriptionZh || catalog?.description || manifest?.description || "",
      descriptionZh: catalog?.descriptionZh || "",
      fullName: catalog?.fullName ?? fullName,
      url: catalog?.url ?? (fullName ? `https://github.com/${fullName}` : manifest?.homepage ?? null),
      enabled: !packageIsDisabled(profile, name),
      updateAvailable: updateAvailable(version, latest),
      latest,
      local,
      protected: isProtectedPackage(name),
      kind: "bundle" as const,
    };
  }));
  return [...plugins, ...listSkills()].sort((left, right) => left.name.localeCompare(right.name));
}

export function uninstallSkill(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("Skill 目录名无效");
  const target = join(skillsRoot(), name);
  if (!existsSync(target)) throw new Error("Skill 未安装");
  rmSync(target, { recursive: true, force: true });
}

export function cleanupAfterUninstall(profile: string, name: string): void {
  removeRowBlocks(userPatchPath(profile), rowIdsForPackage(profile, name));
}
