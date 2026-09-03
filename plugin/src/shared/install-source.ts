/** Pure, allow-listed source recognition. Never execute README commands or forward their flags. */
const NPM_NAME = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
export const NPM_SPEC_RE = new RegExp(`^(${NPM_NAME})(?:@([a-z0-9][a-z0-9._+-]*))?$`, "i");
const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
const REPO = "(?!\\.{1,2}(?:$|[#/]))[A-Za-z0-9._-]{1,100}";
const REF = "[A-Za-z0-9._~+/:=-]+";
export const FULL_NAME_RE = new RegExp(`^${OWNER}/${REPO}$`);
export const GITHUB_SPEC_RE = new RegExp(`^github:(${OWNER})/(${REPO})(?:#(${REF}))?$`, "i");
const GITHUB_URL_RE = new RegExp(`^(?:git\\+)?https://github\\.com/(${OWNER})/(${REPO})/?(?:#(${REF}))?$`, "i");
const UNSAFE = /[\s|&;<>()$`\\'"!*?]/;

export interface CatalogInstallSource {
  fullName: string;
  type?: string;
  installTarget?: unknown;
  installPackageName?: unknown;
  install?: { packageName?: unknown; commands?: readonly unknown[] };
}

export function normalizeInstallTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let token = value.trim();
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1);
  }
  if (!token || token.startsWith("-") || UNSAFE.test(token)) return null;
  const url = token.match(GITHUB_URL_RE);
  if (url) token = `github:${url[1]}/${url[2].replace(/\.git$/i, "")}${url[3] ? `#${url[3]}` : ""}`;
  const github = token.match(GITHUB_SPEC_RE);
  if (github) return `github:${github[1]}/${github[2]}${github[3] ? `#${github[3]}` : ""}`;
  return NPM_SPEC_RE.test(token) ? token : null;
}

/** A # inside a ref or a quoted token is not a shell comment. */
export function stripInstallComment(command: string): string {
  let quote = "";
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === quote) quote = "";
    else if (!quote && (char === "'" || char === '"')) quote = char;
    else if (!quote && char === "#" && (i === 0 || /\s/.test(command[i - 1]))) return command.slice(0, i).trim();
  }
  return command.trim();
}

function commandTokens(value: string): string[] | null {
  if (value.length > 8192 || /[\r\n]/.test(value)) return null;
  const command = stripInstallComment(value.trim().replace(/^[$>]\s+/, ""));
  const tokens: string[] = [];
  // Only whole-token quotes; no escaping, interpolation or shell concatenation.
  const pattern = /"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s'"\r\n]+)/gy;
  let offset = 0;
  while (offset < command.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(command);
    if (!match) return null;
    const token = match[1] ?? match[2] ?? match[3];
    if (!token || UNSAFE.test(token)) return null;
    tokens.push(token);
    offset = pattern.lastIndex;
    if (offset < command.length && !/\s/.test(command[offset])) return null;
    while (/\s/.test(command[offset] ?? "") && offset < command.length) offset++;
  }
  return tokens;
}

export function parseDshInstallCommand(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tokens = commandTokens(value);
  if (!tokens?.length) return null;
  let offset = 1;
  if (tokens[0] === "npx") {
    if (tokens[offset] === "--yes" || tokens[offset] === "-y") offset++;
    if (tokens[offset]?.match(NPM_SPEC_RE)?.[1] !== "@deepseek-ai/dsh") return null;
    offset++;
    if (tokens[offset] === "--") offset++;
  } else if (tokens[0] !== "dsh") return null;

  const args: string[] = [];
  let hasProfile = false;
  let literal = false;
  for (; offset < tokens.length; offset++) {
    const token = tokens[offset];
    if (!literal && token === "--") {
      if (args.length !== 2 || args[0] !== "plugin" || args[1] !== "add") return null;
      literal = true;
    } else if (!literal && (token === "--profile" || token.startsWith("--profile="))) {
      const profile = token === "--profile" ? tokens[++offset] : token.slice(10);
      if (hasProfile || !profile || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(profile)) return null;
      hasProfile = true;
    } else {
      args.push(token);
    }
  }
  if (args.length !== 3 || args[0] !== "plugin" || args[1] !== "add") return null;
  return normalizeInstallTarget(args[2]);
}

export function resolveCatalogInstallTarget(entry: CatalogInstallSource): string | null {
  if (!FULL_NAME_RE.test(entry.fullName)) return null;
  const candidates = [normalizeInstallTarget(entry.installTarget)];
  for (const command of entry.install?.commands ?? []) candidates.push(parseDshInstallCommand(command));
  const github = candidates.find((target) => target?.startsWith("github:")
    && target.slice(7).split("#", 1)[0].toLowerCase() === entry.fullName.toLowerCase());
  if (github) return github;
  const packageName = entry.install?.packageName ?? entry.installPackageName;
  if (typeof packageName === "string") {
    const npm = candidates.find((target) => target?.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase());
    if (npm) return npm;
  }
  return entry.type?.toLowerCase() === "skill" ? `github:${entry.fullName}` : null;
}
