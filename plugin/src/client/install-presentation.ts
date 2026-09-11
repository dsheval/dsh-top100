import type { InstallJobSnapshot, InstallPhase } from "../shared/types.js";

export type InstallErrorKind =
  | "peer"
  | "build"
  | "policy"
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

/** Status follows the operation, never the shared internal mutation phase. */
export function taskPhaseKey(job: InstallJobSnapshot): string {
  const action = job.action ?? "install";
  if (job.activationState === "broken") return `task_${action}_failed`;
  if (["installing", "installed", "failed", "cancelled"].includes(job.phase)) return `task_${action}_${job.phase}`;
  return `phase_${job.phase}`;
}

export function taskProgressKey(jobs: InstallJobSnapshot[]): string {
  const actions = new Set(jobs.map((job) => job.action ?? "install"));
  return actions.size === 1 ? `task_${[...actions][0]}_progress` : "batchProgress";
}

export interface DependencyProgress { resolved?: number; reused?: number; downloaded?: number; added?: number }
export function dependencyProgress(line: string): DependencyProgress | null {
  if (!/\bProgress:/i.test(line)) return null;
  const result: DependencyProgress = {};
  for (const key of ["resolved", "reused", "downloaded", "added"] as const) {
    const value = new RegExp(`\\b${key}\\s+(\\d+)`, "i").exec(line)?.[1];
    if (value !== undefined) result[key] = Number(value);
  }
  return Object.keys(result).length ? result : null;
}

/** Terminal state takes precedence over stale package-manager output. */
export function installStatus(job: InstallJobSnapshot): InstallStatusPresentation {
  if (["installed", "failed", "cancelled"].includes(job.phase)) return { key: taskPhaseKey(job) };
  if (/正在恢复/.test(job.lastLine)) return { key: "taskRecoveringDependencies" };
  if (/Will retry|retries? left|retrying/i.test(job.lastLine)) return { key: "taskNetworkRetry" };
  if (dependencyProgress(job.lastLine)) return { key: "taskDependencies" };
  if (/检查当前.*profile/i.test(job.lastLine)) return { key: "installStatusProfileCheck" };
  if (/验证安装后|验证更新后/i.test(job.lastLine)) return { key: "installStatusFinalCheck" };
  return { key: taskPhaseKey(job) };
}

function ignoredBuildPackages(raw: string): string[] {
  const section = /Ignored build scripts:\s*([\s\S]*?)(?:\s+Run\s+["']?pnpm approve-builds|$)/i.exec(raw)?.[1] ?? "";
  return [...section.matchAll(/(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+@[a-z0-9._~+-]+/gi)]
    .map((match) => match[0]);
}

/** Turn raw pnpm/DSH output into an error category while preserving details. */
export function presentInstallError(raw: string): InstallErrorPresentation {
  const detail = raw.trim() || "install failed";
  const code = /^\[([a-z-]+)\]/.exec(detail)?.[1];
  const kinds: Record<string, InstallErrorKind> = {
    "ignored-builds": "ignored-builds", "peer-dependency": "peer", "host-peer": "peer",
    "prepare-failed": "build", "lifecycle-failed": "build", "release-age": "policy",
    "hoist-drift": "lockfile", "git-network": "network", "transient-network": "network",
    "fetch-timeout": "timeout", "install-timeout": "timeout",
  };
  if (code && kinds[code]) return { kind: kinds[code], packages: code === "ignored-builds" ? ignoredBuildPackages(detail) : [], detail };
  if (/ERR_PNPM_PEER_DEP_ISSUES/.test(detail)) return { kind: "peer", packages: [], detail };
  if (/ERR_PNPM_PREPARE_PACKAGE|ELIFECYCLE/.test(detail)) return { kind: "build", packages: [], detail };
  if (/ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/i.test(detail)) {
    return { kind: "ignored-builds", packages: ignoredBuildPackages(detail), detail };
  }
  if (/ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|ECONNRESET|EAI_AGAIN|ENETUNREACH|socket hang up/i.test(detail)) {
    return { kind: "network", packages: [], detail };
  }
  if (/TimeoutError|UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|timed?\s*out|超时/i.test(detail)) {
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
