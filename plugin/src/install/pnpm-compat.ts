/** pnpm compatibility and one-shot recovery for profile package mutations. */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readProfileManifestSnapshot } from "../host/profile.js";
import type { InstallResult } from "../shared/types.js";

export const RELEASE_AGE_OVERRIDE = "--config.minimumReleaseAge=0";
export const FETCH_TIMEOUT_OVERRIDE = "--config.fetchTimeout=600000";
export const AUTO_INSTALL_PEERS_OFF = "--config.auto-install-peers=false";

export type PluginRunner = (profile: string, args: string[]) => Promise<InstallResult>;

/** pnpm 9 needs `-w` at a workspace root; every pnpm version rejects it outside one. */
export function pluginArgsFor(directory: string, args: string[]): string[] {
  if (args[0] !== "add" && args[0] !== "remove") return args;
  if (!existsSync(join(directory, "pnpm-workspace.yaml"))) return args;
  if (args.includes("-w") || args.includes("--workspace-root")) return args;
  return [args[0], "-w", ...args.slice(1)];
}

type FailureCode = "hoist-drift" | "release-age" | "host-peer" | "fetch-timeout" | "transient-network";

interface PnpmFailure {
  code: FailureCode;
  packageName?: string;
  message: string;
}

function decodedOutput(output: string): string {
  const messages: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed) as { message?: unknown; err?: { message?: unknown } };
      if (typeof event.message === "string") messages.push(event.message);
      if (typeof event.err?.message === "string") messages.push(event.err.message);
    } catch {
      // Preserve human or truncated output below.
    }
  }
  return messages.length > 0 ? `${output}\n${messages.join("\n")}` : output;
}

export function classifyPnpmFailure(raw: string): PnpmFailure | null {
  const output = decodedOutput(raw);
  if (/ERR_PNPM_(?:PUBLIC_HOIST_PATTERN|VIRTUAL_STORE_DIR_MAX_LENGTH)_DIFF/.test(output)) {
    return {
      code: "hoist-drift",
      message: "当前 profile 的 node_modules 由不同版本的 pnpm 创建，已尝试重建后重试。",
    };
  }
  if (/minimumReleaseAge|ERR_PNPM_MISMATCHED_RELEASE_CHANNEL|release is too new/i.test(output)) {
    return {
      code: "release-age",
      message: "pnpm 的新版本等待期阻止了本次变更，已使用单次覆盖参数重试。",
    };
  }
  const hostPeer = /ERR_PNPM_FETCH_404[\s\S]{0,800}?(@deepseek-ai\/[a-z0-9._-]+)/i.exec(output)?.[1];
  if (hostPeer) {
    return {
      code: "host-peer",
      packageName: hostPeer,
      message: `运行时提供的 peer 依赖 ${hostPeer} 未发布到 npm，已关闭自动安装 peer 后重试。`,
    };
  }
  if (/operation was aborted due to timeout|TimeoutError|error \(23\)/i.test(output)) {
    return {
      code: "fetch-timeout",
      message: "插件下载超过 pnpm 的单请求时限，已把时限提高到 10 分钟后重试。",
    };
  }
  if (/ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|socket hang up/i.test(output)) {
    return {
      code: "transient-network",
      message: "下载遇到临时网络错误，已自动重试一次。",
    };
  }
  return null;
}

function succeeded(result: InstallResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.cancelled;
}

/** Apply the narrow, one-shot recoveries used by dsh-market. */
export async function withPnpmRecovery(
  run: PluginRunner,
  profile: string,
  args: string[],
  explicitDir?: string,
): Promise<InstallResult> {
  let result = await run(profile, args);
  if (succeeded(result) || result.cancelled) return result;

  const failure = classifyPnpmFailure(`${result.stdout}\n${result.stderr}`);
  const command = args[0];
  if (failure?.code === "hoist-drift") {
    const rebuilt = await run(profile, ["install", "--no-frozen-lockfile"]);
    if (succeeded(rebuilt)) result = await run(profile, args);
  } else if (
    failure?.code === "release-age"
    && (command === "add" || command === "remove")
    && !args.includes(RELEASE_AGE_OVERRIDE)
  ) {
    result = await run(profile, [command, RELEASE_AGE_OVERRIDE, ...args.slice(1)]);
  } else if (
    failure?.code === "host-peer"
    && failure.packageName
    && (command === "add" || command === "remove")
    && !Object.hasOwn(readProfileManifestSnapshot(profile, explicitDir).dependencies, failure.packageName)
    && !args.includes(AUTO_INSTALL_PEERS_OFF)
  ) {
    result = await run(profile, [command, AUTO_INSTALL_PEERS_OFF, ...args.slice(1)]);
  } else if (
    failure?.code === "fetch-timeout"
    && (command === "add" || command === "remove")
    && !args.includes(FETCH_TIMEOUT_OVERRIDE)
  ) {
    result = await run(profile, [command, FETCH_TIMEOUT_OVERRIDE, ...args.slice(1)]);
  } else if (failure?.code === "transient-network" && (command === "add" || command === "remove")) {
    result = await run(profile, args);
  }

  if (!succeeded(result) && !result.cancelled && failure) {
    result = { ...result, stderr: `${result.stderr}\n\n${failure.message}`.trim() };
  }
  return result;
}
