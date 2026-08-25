/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */
import type { InstallSpec } from "../shared/types.js";
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
export declare function verifyInstallSpec(spec: InstallSpec): Promise<VerifiedInstallTarget>;
