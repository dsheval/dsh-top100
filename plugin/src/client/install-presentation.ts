import type { InstallJobSnapshot, InstallPhase } from "../shared/types.js";

export type InstallErrorKind =
  | "ignored-builds"
  | "network"
  | "timeout"
  | "permission"
  | "lockfile"
  | "profile"
  | "source"
  | "generic";

export interface InstallErrorPresentation {
  kind: InstallErrorKind;
  packages: string[];
  detail: string;
}

export interface InstallStatusPresentation {
  key: string;
  count?: number;
}

const ACTIVE_RANGES: Record<Exclude<InstallPhase, "installed" | "failed" | "cancelled">, [number, number, number]> = {
  queued: [6, 10, 8_000],
  validating: [16, 30, 12_000],
  downloading: [36, 56, 18_000],
  "waiting-profile-lock": [60, 66, 20_000],
  installing: [70, 92, 30_000],
};

function easedProgress(start: number, end: number, elapsed: number, duration: number): number {
  const ratio = 1 - Math.exp(-Math.max(0, elapsed) / duration);
  return Math.round(start + (end - start) * ratio);
}

function terminalProgress(job: InstallJobSnapshot): number {
  const output = `${job.lastLine}\n${job.error ?? ""}`;
  if (/安装源|catalog|trusted source/i.test(output)) return 26;
  if (/下载|fetch|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(output)) return 50;
  if (/等待.*profile|lockfile|锁/i.test(output)) return 64;
  if (/Progress:|ERR_PNPM_|写入|配置验证|profile/i.test(output)) return 88;
  return 76;
}

/** A phase-based estimate. Active work deliberately stops below 100%. */
export function installProgress(job: InstallJobSnapshot, now = Date.now()): number {
  if (job.phase === "installed") return 100;
  if (job.phase === "failed" || job.phase === "cancelled") return terminalProgress(job);
  const [start, end, duration] = ACTIVE_RANGES[job.phase];
  const reference = job.startedAt ?? job.createdAt;
  return easedProgress(start, end, now - reference, duration);
}

function progressAddedCount(line: string): number | null {
  if (!/\bProgress:/i.test(line)) return null;
  const added = /\badded\s+(\d+)/i.exec(line)?.[1];
  if (added !== undefined) return Number(added);
  const resolved = /\bresolved\s+(\d+)/i.exec(line)?.[1];
  return resolved === undefined ? null : Number(resolved);
}

/** Replace package-manager chatter with one short, stable status sentence. */
export function installStatus(job: InstallJobSnapshot): InstallStatusPresentation {
  const dependencyCount = progressAddedCount(job.lastLine);
  if (dependencyCount !== null) return { key: "installStatusDependencies", count: dependencyCount };
  if (/检查当前.*profile/i.test(job.lastLine)) return { key: "installStatusProfileCheck" };
  if (/验证安装后|验证更新后/i.test(job.lastLine)) return { key: "installStatusFinalCheck" };
  if (/写入.*profile/i.test(job.lastLine)) return { key: "installStatusWriting" };
  const keys: Record<InstallPhase, string> = {
    queued: "installStatusQueued",
    validating: "installStatusValidating",
    downloading: "installStatusDownloading",
    "waiting-profile-lock": "installStatusWaiting",
    installing: "installStatusWriting",
    installed: "installStatusInstalled",
    failed: "installStatusFailed",
    cancelled: "installStatusCancelled",
  };
  return { key: keys[job.phase] };
}

function ignoredBuildPackages(raw: string): string[] {
  const section = /Ignored build scripts:\s*([\s\S]*?)(?:\s+Run\s+["']?pnpm approve-builds|$)/i.exec(raw)?.[1] ?? "";
  return [...section.matchAll(/(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+@[a-z0-9._~+-]+/gi)]
    .map((match) => match[0]);
}

/** Turn raw pnpm/DSH output into an error category while preserving details. */
export function presentInstallError(raw: string): InstallErrorPresentation {
  const detail = raw.trim() || "install failed";
  if (/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/i.test(detail)) {
    return { kind: "ignored-builds", packages: ignoredBuildPackages(detail), detail };
  }
  if (/ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|ECONNRESET|EAI_AGAIN|ENETUNREACH|socket hang up/i.test(detail)) {
    return { kind: "network", packages: [], detail };
  }
  if (/TimeoutError|ETIMEDOUT|timed?\s*out|超时/i.test(detail)) {
    return { kind: "timeout", packages: [], detail };
  }
  if (/\bEACCES\b|\bEPERM\b|permission denied|权限/i.test(detail)) {
    return { kind: "permission", packages: [], detail };
  }
  if (/ERR_PNPM_(?:OUTDATED_)?LOCKFILE|frozen[- ]lockfile|lockfile.*(?:mismatch|broken|冲突)/i.test(detail)) {
    return { kind: "lockfile", packages: [], detail };
  }
  if (/配置验证|dsh\.profile|cordis\.patch|profile.*(?:invalid|problem|问题)/i.test(detail)) {
    return { kind: "profile", packages: [], detail };
  }
  if (/published catalog|trusted DSH install source|安装源|source verification/i.test(detail)) {
    return { kind: "source", packages: [], detail };
  }
  return { kind: "generic", packages: [], detail };
}
