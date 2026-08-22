import type { InstallSpec } from "./types.js";
export declare class InstallVerificationError extends Error {
    fatal: boolean;
    constructor(message: string, fatal?: boolean);
}
export interface VerifiedInstallTarget {
    target: string;
    source: "npm" | "github";
    packageName: string | null;
    needsBuildApproval: boolean;
}
/** Return a verified, independently installable root or monorepo target. */
export declare function verifyInstallSpec(spec: InstallSpec): Promise<VerifiedInstallTarget>;
