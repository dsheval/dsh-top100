/** Resolve immutable install evidence before the user is asked to approve a profile change. */
import { type VerifiedInstallTarget } from "../install/install-verify.js";
import { type VerifiedSkillSource } from "../install/skill-install.js";
import type { InstallPreflight, RankingEntry } from "../shared/types.js";
export interface ApprovedInstall {
    entry: RankingEntry;
    preflight: InstallPreflight;
    bundleTarget: VerifiedInstallTarget | null;
    skillSource: VerifiedSkillSource | null;
}
/** Shared evidence presentation; approval storage remains owned by each operation. */
export declare function bundleInstallPreflight(bundleTarget: VerifiedInstallTarget, options: {
    fullName: string;
    profile: string;
    approvalToken: string;
    expiresAt: number;
    needsConfig?: boolean;
}): InstallPreflight;
export declare function createInstallPreflight(entry: RankingEntry, profile: string, signal?: AbortSignal): Promise<ApprovedInstall>;
/** Validate the whole batch before consuming any approval, so failure is retryable. */
export declare function validateInstallApprovals(requests: readonly {
    fullName: string;
    approvalToken: string;
    risksAccepted?: boolean;
}[], profile: string): ApprovedInstall[];
export declare function consumeInstallApproval(token: string, fullName: string, profile: string, risksAccepted?: boolean): ApprovedInstall;
export declare function clearInstallApprovals(): void;
