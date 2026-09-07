import { type VerifiedInstallTarget } from "../install/install-verify.js";
import type { InstallPreflight } from "../shared/types.js";
export interface ApprovedUpdate {
    name: string;
    currentSpec: string;
    currentVersion: string | null;
    preflight: InstallPreflight;
    bundleTarget: VerifiedInstallTarget;
}
export declare function assertUpdateUnchanged(approval: ApprovedUpdate, profile: string, profileDirectory?: string): void;
export declare function createUpdatePreflight(name: string, profile: string, profileDirectory?: string, signal?: AbortSignal): Promise<ApprovedUpdate>;
/** Validate the entire batch before consuming any token. */
export declare function validateUpdateApprovals(requests: Array<{
    name: string;
    approvalToken: string;
    risksAccepted: boolean;
}>, profile: string, profileDirectory?: string): ApprovedUpdate[];
export declare function clearUpdateApprovals(): void;
export declare function discardUpdateApprovals(tokens: readonly string[]): void;
