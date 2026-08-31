/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */
import type { InstallSpec, LifecycleScriptEvidence } from "../shared/types.js";
export declare class InstallVerificationError extends Error {
    fatal: boolean;
    status: number | null;
    constructor(message: string, fatal?: boolean, status?: number | null);
}
export interface VerifiedInstallTarget {
    requestedTarget: string;
    target: string;
    source: "npm" | "github";
    packageName: string | null;
    version: string | null;
    commit: string | null;
    integrity: string | null;
    repositoryUrl: string | null;
    repositoryIdentity: "matched" | "unavailable" | "not-applicable";
    lifecycleScripts: LifecycleScriptEvidence[];
    verifiedAt: number;
    needsBuildApproval: boolean;
    /** Exact pnpm allowBuilds keys verified for this source. */
    buildApprovalKeys: string[];
}
export interface VerifyInstallOptions {
    expectedRepository?: string;
}
export declare function clearInstallVerificationCache(): void;
export declare function verifyInstallSpec(spec: InstallSpec, options?: VerifyInstallOptions): Promise<VerifiedInstallTarget>;
