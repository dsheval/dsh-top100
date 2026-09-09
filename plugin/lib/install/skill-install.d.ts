/** Install a catalogued Skill without executing repository code or README commands. */
export interface InstalledSkill {
    name: string;
    alreadyInstalled: boolean;
    commit: string;
    digest: string;
    files: string[];
    /** Previous global copy, including all local edits, retained after replacement. */
    backupPath?: string;
    /** Transaction ownership check; intentionally omitted from persisted provenance. */
    installationIdentity?: string;
}
export interface VerifiedSkillSource {
    fullName: string;
    repositoryUrl: string;
    commit: string;
    verifiedAt: number;
}
/** Undo this transaction without treating rollback as a user-requested uninstall. */
export declare function rollbackInstalledSkill(skill: InstalledSkill): void;
export declare function verifySkillSource(fullName: string, signal?: AbortSignal): Promise<VerifiedSkillSource>;
export declare function installSkill(fullName: string, options?: {
    signal?: AbortSignal;
    commit?: string;
    replaceExisting?: boolean;
}): Promise<InstalledSkill[]>;
