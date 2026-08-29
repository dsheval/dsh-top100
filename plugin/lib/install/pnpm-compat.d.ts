/** pnpm compatibility and one-shot recovery for profile package mutations. */
import type { InstallResult } from "../shared/types.js";
export declare const RELEASE_AGE_OVERRIDE = "--config.minimumReleaseAge=0";
export declare const FETCH_TIMEOUT_OVERRIDE = "--config.fetchTimeout=600000";
export declare const AUTO_INSTALL_PEERS_OFF = "--config.auto-install-peers=false";
export type PluginRunner = (profile: string, args: string[]) => Promise<InstallResult>;
/** pnpm 9 needs `-w` at a workspace root; every pnpm version rejects it outside one. */
export declare function pluginArgsFor(directory: string, args: string[]): string[];
type FailureCode = "hoist-drift" | "release-age" | "host-peer" | "fetch-timeout" | "transient-network";
interface PnpmFailure {
    code: FailureCode;
    packageName?: string;
    message: string;
}
export declare function classifyPnpmFailure(raw: string): PnpmFailure | null;
/** Apply the narrow, one-shot recoveries used by dsh-market. */
export declare function withPnpmRecovery(run: PluginRunner, profile: string, args: string[], explicitDir?: string): Promise<InstallResult>;
export {};
