import { type VerifiedInstallTarget } from "../install/install-verify.js";
import { type InstallPreflight, type UpdatePreflightItem, type UpdateStrategy } from "../shared/types.js";
export declare class UpdateNotAvailableError extends Error {
    readonly code = "no-update";
    constructor(message: string);
}
export interface ApprovedUpdate {
    name: string;
    currentSpec: string;
    currentVersion: string | null;
    preflight: InstallPreflight;
    bundleTarget: VerifiedInstallTarget;
}
export declare function startUpdatePreflightSession(profile: string, directory?: string): {
    sessionToken: string;
    expiresAt: number;
};
export declare function discardUpdatePreflightSession(token: string, profile: string, directory?: string): void;
/** Draft checks cannot install. Only this final identity check opens the ten-minute confirmation window. */
export declare function finalizeUpdatePreflightSession(token: string, profile: string, directory?: string): UpdatePreflightItem[];
export declare function assertUpdateUnchanged(approval: ApprovedUpdate, profile: string, profileDirectory?: string): void;
export declare function createUpdatePreflight(name: string, profile: string, profileDirectory?: string, signal?: AbortSignal, strategy?: UpdateStrategy, sessionToken?: string): Promise<ApprovedUpdate>;
/** Validate the entire batch before consuming any token. */
export declare function validateUpdateApprovals(requests: Array<{
    name: string;
    approvalToken: string;
    risksAccepted: boolean;
}>, profile: string, profileDirectory?: string): ApprovedUpdate[];
export declare function clearUpdateApprovals(): void;
export declare function discardUpdateApprovals(tokens: readonly string[]): void;
