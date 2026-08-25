/** Read the current DSH profile's installed packages. */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InstalledMap } from "../shared/types.js";

export const INBOX_BUNDLES = new Set([
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-headless",
]);

export function profileDir(profile: string, explicitDir?: string): string {
  if (explicitDir !== undefined) return explicitDir;
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

export function argvProfile(): string | undefined {
  const argv = process.argv;
  const flag = argv.indexOf("--profile");
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith("-")) {
    return argv[flag + 1];
  }
  return undefined;
}
