/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */

import type { InstallSpec, RankingEntry } from "../shared/types.js";

import { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE, normalizeInstallTarget, resolveCatalogInstallTarget } from "../shared/install-source.js";
import { parseGitHubSource, githubInstallTarget } from "../shared/github-source.js";
export { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE };
// Only generated, commit-pinned sources may use &path:. Raw README targets cannot.
export const SAFE_TARGET_RE = /^[A-Za-z0-9@:./_#&+-]+$/;

export function isCordisEntry(entry: Pick<RankingEntry, "type" | "install">): boolean {
  const type = entry.type?.toLowerCase() ?? "";
  const method = entry.install?.method?.toLowerCase() ?? "";
  return type === "cordis-plugin" || type === "cordis" || method === "pnpm-profile";
}

export function parseInstallSpec(raw: string): InstallSpec | null {
  const token = normalizeInstallTarget(raw);
  if (!token) return null;

  const github = parseGitHubSource(token);
  if (github) return { kind: "github", spec: githubInstallTarget(github) };

  if (NPM_SPEC_RE.test(token) && !token.startsWith(".") && !token.includes("\\")) {
    return { kind: "npm", spec: token };
  }
  return null;
}

export function npmPackageSpec(spec: string): { name: string; selector: string | null } | null {
  const match = spec.match(NPM_SPEC_RE);
  if (!match) return null;
  return { name: match[1], selector: match[2] ?? null };
}

export function resolveInstallSpec(entry: RankingEntry): InstallSpec | null {
  const target = resolveCatalogInstallTarget(entry);
  return target ? parseInstallSpec(target) : null;
}

/** Recognize only registry versions/ranges/tags, never URLs, aliases or other protocols. */
export function isNpmRegistrySpecifier(value: string): boolean {
  const spec = value.trim();
  return /^[A-Za-z][A-Za-z0-9._-]*$/.test(spec)
    || /^(?:[~^<>=]*\s*)?(?:v?\d|[xX*])[A-Za-z0-9.*+~^<>=| -]*$/.test(spec);
}

export function isInstalledEntry(entry: RankingEntry, installed: Record<string, string>): boolean {
  const spec = resolveInstallSpec(entry);
  const expectedSource = spec?.kind === "github" ? parseGitHubSource(spec.spec) : null;
  const expectedPackage = entry.install?.packageName ?? (spec?.kind === "npm" ? npmPackageSpec(spec.spec)?.name : null);
  const expectedPath = entry.install?.repositoryPath?.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "") ?? expectedSource?.path;
  for (const [name, value] of Object.entries(installed)) {
    if (expectedPackage && name.toLowerCase() !== expectedPackage.toLowerCase()) continue;
    const source = parseGitHubSource(value);
    if (source) {
      if (source.repository === entry.fullName.toLowerCase() && (!expectedPath || source.path === expectedPath)) return true;
    } else if (expectedPackage && isNpmRegistrySpecifier(value)) {
      return true;
    }
  }
  return false;
}
