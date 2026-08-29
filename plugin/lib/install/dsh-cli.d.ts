/** Spawn `dsh plugin` the same way the official CLI forwards to pnpm. */
import type { InstallResult, ProgressSnapshot } from "../shared/types.js";
export declare function toolSearchDirs(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, home?: string): string[];
export declare function proxyEnvForPnpm(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare const progress: ProgressSnapshot;
export declare function quoteCmdArg(arg: string): string;
export declare function cmdCommandLine(argv: readonly string[]): string;
/** Keep Node loader/runtime flags, but never forward wrapper-only eval flags to the DSH child. */
export declare function safeExecArgv(argv: readonly string[]): string[];
export declare function dshArgv(): {
    file: string;
    args: string[];
    cwd: string | undefined;
    viaShell: boolean;
};
export declare function cancelActive(): boolean;
export declare function runDshPlugin(profile: string, pluginArgs: string[], meta?: {
    fullName?: string;
}): Promise<InstallResult>;
/** Compose the selected profile without starting it, using the exact CLI that launched this plugin. */
export declare function runDshProfileCheck(profile: string): Promise<InstallResult>;
