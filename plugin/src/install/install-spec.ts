/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */

import type { InstallSpec, RankingEntry } from "../shared/types.js";

const NPM_NAME_SOURCE = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
const NPM_SELECTOR_SOURCE = "[a-z0-9][a-z0-9._+-]*";
export const NPM_SPEC_RE = new RegExp(`^(${NPM_NAME_SOURCE})(?:@(${NPM_SELECTOR_SOURCE}))?$`, "i");
export const GITHUB_SPEC_RE =
  /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9._~+/:=-]+))?$/i;
export const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// `&` is used only by our generated, commit-pinned GitHub `sha&path:` target.
// Raw catalog commands still reject it through UNSAFE_TOKEN below.
export const SAFE_TARGET_RE = /^[A-Za-z0-9@:./_#&+-]+$/;

const DSH_ADD_RE = /\bdsh\s+plugin\b(?:\s+--profile\s+\S+)?\s+add\s+(.+)$/i;
const UNSAFE_TOKEN = /[\s|&;<>()$`\\'"!*?]/;

export function isCordisEntry(entry: Pick<RankingEntry, "type" | "install">): boolean {
  const type = entry.type?.toLowerCase() ?? "";
  const method = entry.install?.method?.toLowerCase() ?? "";
  return type === "cordis-plugin" || type === "cordis" || method === "pnpm-profile";
}

export function parseInstallSpec(raw: string): InstallSpec | null {
  const token = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!token || UNSAFE_TOKEN.test(token) || !SAFE_TARGET_RE.test(token)) return null;
  if (token.startsWith("-")) return null;
  if (token.startsWith("link:") || token.startsWith("file:") || token.startsWith("http")) return null;

  const github = token.match(GITHUB_SPEC_RE);
  if (github) {
    return { kind: "github", spec: `github:${github[1]}/${github[2]}${github[3] ? `#${github[3]}` : ""}` };
  }

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

function specFromCommands(entry: RankingEntry): InstallSpec | null {
  const candidates: InstallSpec[] = [];
  for (const command of entry.install?.commands ?? []) {
    const dsh = command.match(DSH_ADD_RE);
    if (dsh) {
      const target = dsh[1].trim();
      if (target.split(/\s+/).length !== 1) continue;
      const spec = parseInstallSpec(target);
      if (spec) candidates.push(spec);
    }
  }
  const github = candidates.find((candidate) => candidate.kind === "github"
    && candidate.spec.slice("github:".length).split("#", 1)[0].toLowerCase() === entry.fullName.toLowerCase());
  if (github) return github;
  const packageName = entry.install?.packageName;
  return typeof packageName === "string"
    ? candidates.find((candidate) => candidate.kind === "npm"
      && npmPackageSpec(candidate.spec)?.name.toLowerCase() === packageName.trim().toLowerCase()) ?? null
    : null;
}

export function resolveInstallSpec(entry: RankingEntry): InstallSpec | null {
  if (!FULL_NAME_RE.test(entry.fullName)) return null;
  const fromCommands = specFromCommands(entry);
  if (fromCommands) return fromCommands;
  if (entry.type?.toLowerCase() === "skill") {
    return { kind: "github", spec: `github:${entry.fullName}` };
  }
  return null;
}

export function isInstalledEntry(entry: RankingEntry, installed: Record<string, string>): boolean {
  const spec = resolveInstallSpec(entry);
  const fullName = entry.fullName.toLowerCase();
  const repo = entry.name.toLowerCase();
  for (const [name, value] of Object.entries(installed)) {
    if (name.toLowerCase() === repo) return true;
    const packageName = spec?.kind === "npm" ? npmPackageSpec(spec.spec)?.name.toLowerCase() : null;
    if (packageName && name.toLowerCase() === packageName) return true;
    const source = value.toLowerCase().replace(/^git\+/, "");
    if (source === `github:${fullName}` || source.startsWith(`github:${fullName}#`)) return true;
    if (
      source.startsWith(`https://github.com/${fullName}.git`)
      || source.startsWith(`https://github.com/${fullName}#`)
      || source === `https://github.com/${fullName}`
      || source.startsWith(`git://github.com/${fullName}.git`)
    ) return true;
  }
  return false;
}
