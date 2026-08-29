/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */

import type { InstallSpec, RankingEntry } from "../shared/types.js";

const NPM_NAME_SOURCE = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
const NPM_SELECTOR_SOURCE = "[a-z0-9][a-z0-9._+-]*";
export const NPM_SPEC_RE = new RegExp(`^(${NPM_NAME_SOURCE})(?:@(${NPM_SELECTOR_SOURCE}))?$`, "i");
export const GITHUB_SPEC_RE =
  /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([A-Za-z0-9._~+/:=-]+))?$/i;
export const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const SAFE_TARGET_RE = /^[A-Za-z0-9@:./_#+-]+$/;

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

function specFromCommands(commands: string[] | undefined): InstallSpec | null {
  for (const command of commands ?? []) {
    const dsh = command.match(DSH_ADD_RE);
    if (dsh) {
      const target = dsh[1]
        .trim()
        .split(/\s+/)
        .find((token) => !token.startsWith("-"));
      const spec = target ? parseInstallSpec(target) : null;
      if (spec) return spec;
    }
  }
  return null;
}

export function resolveInstallSpec(entry: RankingEntry): InstallSpec | null {
  const fromCommands = specFromCommands(entry.install?.commands);
  if (fromCommands) return fromCommands;
  if (!FULL_NAME_RE.test(entry.fullName)) return null;
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
    if (spec?.kind === "npm" && name === npmPackageSpec(spec.spec)?.name) return true;
    const haystack = `${name} ${value}`.toLowerCase();
    if (haystack.includes(fullName)) return true;
    if (spec && haystack.includes(spec.spec.toLowerCase())) return true;
  }
  return false;
}
