/** Read the current DSH profile's installed packages. */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { InstalledMap } from "../shared/types.js";

export const INBOX_BUNDLES = new Set([
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-headless",
]);

/** Match DSH's own profile directory-name rules (dots, spaces, and Unicode are valid). */
export function isDshProfileName(profile: string): boolean {
  return profile !== ""
    && profile !== "."
    && profile !== ".."
    && profile !== "node_modules"
    && !profile.includes("/")
    && !profile.includes("\\")
    && !profile.includes("\0");
}

export function profileDir(profile: string, explicitDir?: string): string {
  if (explicitDir !== undefined) return explicitDir;
  if (!isDshProfileName(profile)) throw new Error(`dsh-top100: invalid profile name ${JSON.stringify(profile)}`);
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, "profiles", profile);
}

export function readInstalled(profile: string, explicitDir?: string): InstalledMap {
  try {
    const manifest = JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const installed: InstalledMap = {};
    for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
      if (!INBOX_BUNDLES.has(name)) installed[name] = spec;
    }
    return installed;
  } catch {
    return {};
  }
}

export interface ProfileManifestSnapshot {
  dependencies: Record<string, string>;
  profileBundles: { present: false } | { present: true; value: unknown };
  lockfile: { present: false } | { present: true; value: string };
  workspace: { present: false } | { present: true; value: string };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function writeManifestAtomic(path: string, manifest: unknown): void {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

/** Capture every profile file or field that a package operation may mutate. */
export function readProfileManifestSnapshot(
  profile: string,
  explicitDir?: string,
): ProfileManifestSnapshot {
  try {
    const manifest = JSON.parse(
      readFileSync(join(profileDir(profile, explicitDir), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; dsh?: { profile?: unknown } };
    const profileManifest = objectRecord(manifest.dsh?.profile);
    const present = profileManifest !== undefined && Object.hasOwn(profileManifest, "bundles");
    const lockPath = join(profileDir(profile, explicitDir), "pnpm-lock.yaml");
    let lockfile: ProfileManifestSnapshot["lockfile"] = { present: false };
    try { lockfile = { present: true, value: readFileSync(lockPath, "utf8") }; } catch { /* absent */ }
    const workspacePath = join(profileDir(profile, explicitDir), "pnpm-workspace.yaml");
    let workspace: ProfileManifestSnapshot["workspace"] = { present: false };
    try { workspace = { present: true, value: readFileSync(workspacePath, "utf8") }; } catch { /* absent */ }
    return {
      dependencies: { ...manifest.dependencies },
      profileBundles: present
        ? { present: true, value: structuredClone(profileManifest.bundles) }
        : { present: false },
      lockfile,
      workspace,
    };
  } catch {
    return {
      dependencies: {},
      profileBundles: { present: false },
      lockfile: { present: false },
      workspace: { present: false },
    };
  }
}

/** Restore only the manifest fields owned by a failed package operation. */
export function restoreProfileManifest(
  profile: string,
  snapshot: ProfileManifestSnapshot,
  explicitDir?: string,
): string[] {
  const path = join(profileDir(profile, explicitDir), "package.json");
  let manifest: { dependencies?: Record<string, string>; dsh?: unknown };
  try {
    manifest = JSON.parse(readFileSync(path, "utf8")) as typeof manifest;
  } catch {
    return [];
  }

  const currentDependencies = manifest.dependencies ?? {};
  const changed = new Set<string>();
  for (const name of new Set([...Object.keys(currentDependencies), ...Object.keys(snapshot.dependencies)])) {
    if (currentDependencies[name] !== snapshot.dependencies[name]) changed.add(name);
  }

  const dsh = objectRecord(manifest.dsh);
  const profileManifest = objectRecord(dsh?.profile);
  const currentBundles = profileManifest !== undefined && Object.hasOwn(profileManifest, "bundles")
    ? { present: true as const, value: profileManifest.bundles }
    : { present: false as const };
  const bundlesChanged = currentBundles.present !== snapshot.profileBundles.present
    || (currentBundles.present && snapshot.profileBundles.present
      && !isDeepStrictEqual(currentBundles.value, snapshot.profileBundles.value));
  if (bundlesChanged) changed.add("dsh.profile.bundles");
  const lockPath = join(profileDir(profile, explicitDir), "pnpm-lock.yaml");
  let currentLock: string | null = null;
  try { currentLock = readFileSync(lockPath, "utf8"); } catch { /* absent */ }
  const lockChanged = snapshot.lockfile.present
    ? currentLock !== snapshot.lockfile.value
    : currentLock !== null;
  if (lockChanged) changed.add("pnpm-lock.yaml");
  const workspacePath = join(profileDir(profile, explicitDir), "pnpm-workspace.yaml");
  let currentWorkspace: string | null = null;
  try { currentWorkspace = readFileSync(workspacePath, "utf8"); } catch { /* absent */ }
  const workspaceChanged = snapshot.workspace.present
    ? currentWorkspace !== snapshot.workspace.value
    : currentWorkspace !== null;
  if (workspaceChanged) changed.add("pnpm-workspace.yaml");
  if (changed.size === 0) return [];

  manifest.dependencies = { ...snapshot.dependencies };
  if (snapshot.profileBundles.present) {
    const nextDsh = dsh ?? {};
    const nextProfile = profileManifest ?? {};
    manifest.dsh = nextDsh;
    nextDsh.profile = nextProfile;
    nextProfile.bundles = structuredClone(snapshot.profileBundles.value);
  } else if (profileManifest !== undefined) {
    delete profileManifest.bundles;
  }
  writeManifestAtomic(path, manifest);
  if (lockChanged) {
    if (snapshot.lockfile.present) {
      const temporary = `${lockPath}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, snapshot.lockfile.value, "utf8");
      renameSync(temporary, lockPath);
    } else if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  }
  if (workspaceChanged) {
    if (snapshot.workspace.present) {
      const temporary = `${workspacePath}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temporary, snapshot.workspace.value, "utf8");
      renameSync(temporary, workspacePath);
    } else if (existsSync(workspacePath)) {
      unlinkSync(workspacePath);
    }
  }
  return [...changed];
}

/** Finish a half-uninstall when the package is already gone from disk. */
export function dropFromManifest(profile: string, name: string, explicitDir?: string): boolean {
  const path = join(profileDir(profile, explicitDir), "package.json");
  let manifest: { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } } };
  try {
    manifest = JSON.parse(readFileSync(path, "utf8")) as typeof manifest;
  } catch {
    return false;
  }
  let changed = false;
  if (manifest.dependencies?.[name] !== undefined) {
    delete manifest.dependencies[name];
    changed = true;
  }
  const bundles = manifest.dsh?.profile?.bundles;
  if (Array.isArray(bundles) && bundles.includes(name)) {
    manifest.dsh!.profile!.bundles = bundles.filter((bundle) => bundle !== name);
    changed = true;
  }
  if (changed) writeManifestAtomic(path, manifest);
  return changed;
}

export function readInstalledVersion(profile: string, name: string, explicitDir?: string): string | null {
  try {
    const manifest = JSON.parse(
      readFileSync(join(profileDir(profile, explicitDir), "node_modules", name, "package.json"), "utf8"),
    ) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

export function readInstalledManifest(
  profile: string,
  name: string,
  explicitDir?: string,
): { name?: string; version?: string; description?: string; homepage?: string; repository?: unknown } | null {
  try {
    return JSON.parse(
      readFileSync(join(profileDir(profile, explicitDir), "node_modules", name, "package.json"), "utf8"),
    ) as { name?: string; version?: string; description?: string; homepage?: string; repository?: unknown };
  } catch {
    return null;
  }
}

export function argvProfile(argv: readonly string[] = process.argv): string | undefined {
  const flag = argv.indexOf("--profile");
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith("-")) {
    return argv[flag + 1];
  }
  return undefined;
}

export function resolveActiveProfile(configured?: string, argv: readonly string[] = process.argv): string {
  return configured?.trim() || argvProfile(argv) || "web";
}
