/** Install a catalogued Skill without executing repository code or README commands. */
export interface InstalledSkill {
    name: string;
    alreadyInstalled: boolean;
    commit: string;
    digest: string;
    files: string[];
}
export interface VerifiedSkillSource {
    fullName: string;
    repositoryUrl: string;
    commit: string;
    verifiedAt: number;
}
export declare function verifySkillSource(fullName: string, signal?: AbortSignal): Promise<VerifiedSkillSource>;
export declare function installSkill(fullName: string, options?: {
    signal?: AbortSignal;
    commit?: string;
}): Promise<InstalledSkill[]>;
