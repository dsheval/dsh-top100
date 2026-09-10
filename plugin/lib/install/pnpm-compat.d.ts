/** pnpm compatibility and one-shot network recovery for profile package mutations. */
import type { InstallResult } from "../shared/types.js";
export type PluginRunner = (profile: string, args: string[]) => Promise<InstallResult>;
/** pnpm 9 needs `-w` at a workspace root; every pnpm version rejects it outside one. */
export declare function pluginArgsFor(directory: string, args: string[]): string[];
export type PnpmFailureCode = "ignored-builds" | "peer-dependency" | "prepare-failed" | "lifecycle-failed" | "hoist-drift" | "release-age" | "host-peer" | "git-network" | "fetch-timeout" | "transient-network";
export interface PnpmFailure {
    code: PnpmFailureCode;
    packageName?: string;
    message: string;
}
export interface InstallFailure {
    code: PnpmFailureCode | "cancelled" | "install-timeout" | "install-failed";
    packageName?: string;
    message: string;
}
/** Classify a failed command's output; warnings alone do not establish failure. */
export declare function classifyPnpmFailure(raw: string): PnpmFailure | null;
/** UI summary only. Keep stdout/stderr as the unabridged details of both attempts. */
export declare function classifyInstallFailure(result: InstallResult): InstallFailure | null;
/** Retry only transport failures, once, with the user's exact options and policy. */
export declare function withPnpmRecovery(run: PluginRunner, profile: string, args: string[], _explicitDir?: string): Promise<InstallResult>;
