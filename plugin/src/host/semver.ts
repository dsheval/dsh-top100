/** Small semver helpers for peer-range diagnostics. */

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export interface Semver { major: number; minor: number; patch: number; pre: string }

export function parseSemver(value: string): Semver | null {
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  if (match.slice(1, 4).some((part) => !Number.isSafeInteger(Number(part)))
    || match[4]?.split(".").some((part) => /^0\d+$/.test(part))) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? "" };
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return left < right ? -1 : left > right ? 1 : 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  const leftParts = a.pre.split(".");
  const rightParts = b.pre.split(".");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function caretUpper(target: Semver): string {
  if (target.major > 0) return `${target.major + 1}.0.0`;
  if (target.minor > 0) return `0.${target.minor + 1}.0`;
  return `0.0.${target.patch + 1}`;
}

function compareOne(version: string, token: string): boolean | null {
  const part = token.trim();
  if (!part || part === "*" || part === "x" || part === "X") return true;
  const match = /^(>=|<=|>|<|\^|~)?(.+)$/.exec(part);
  if (!match) return null;
  const raw = match[2].trim();
  const parsed = parseSemver(raw);
  if (!parsed) return null;
  const compared = compareSemver(version, raw);
  switch (match[1] ?? "") {
    case "": return compared === 0;
    case ">=": return compared >= 0;
    case "<=": return compared <= 0;
    case ">": return compared > 0;
    case "<": return compared < 0;
    case "^": return compared >= 0 && compareSemver(version, caretUpper(parsed)) < 0;
    case "~": return compared >= 0 && compareSemver(version, `${parsed.major}.${parsed.minor + 1}.0`) < 0;
    default: return null;
  }
}

export function satisfiesRange(version: string, range: string): boolean | null {
  if (!parseSemver(version)) return null;
  const raw = range.trim();
  if (!raw) return true;
  if (raw.includes("||")) {
    const outcomes = raw.split("||").map((part) => satisfiesRange(version, part.trim()));
    if (outcomes.some((item) => item === true)) return true;
    return outcomes.every((item) => item === null) ? null : false;
  }
  const results = raw.split(/\s+/).filter(Boolean).map((token) => compareOne(version, token));
  if (results.some((item) => item === null)) return null;
  return results.every((item) => item === true);
}
