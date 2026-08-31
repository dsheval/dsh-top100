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
export declare function createInstallPreflight(entry: RankingEntry, profile: string): Promise<ApprovedInstall>;
export declare function consumeInstallApproval(token: string, fullName: string, profile: string, risksAccepted?: boolean): ApprovedInstall;
export declare function clearInstallApprovals(): void;
