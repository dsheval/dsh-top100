/** Spawn `dsh plugin` the same way the official CLI forwards to pnpm. */
import type { InstallResult, ProgressSnapshot } from "../shared/types.js";
export declare const progress: ProgressSnapshot;
export declare function quoteCmdArg(arg: string): string;
export declare function cmdCommandLine(argv: readonly string[]): string;
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
