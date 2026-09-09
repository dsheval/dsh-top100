/** Global Skills are shared by every profile; preserve their contents on removal. */
/** Keep global filesystem mutation and its profile ledger write in one transaction. */
export declare function withSkillMutationLock<T>(operation: () => Promise<T> | T, signal?: AbortSignal): Promise<T>;
export interface SkillEvidence {
    digest?: string;
    files?: readonly string[];
}
export interface SkillInspection {
    name: string;
    scope: "global";
    installed: boolean;
    path: string;
    files: string[];
    digest: string | null;
    modificationState: "unchanged" | "modified" | "unknown";
}
export interface SkillBackup {
    name: string;
    scope: "global";
    backupPath: string;
}
export declare function skillHome(): string;
export declare function globalSkillsRoot(): string;
export declare function assertGlobalSkillRoot(): void;
export declare function skillTarget(name: string): string;
/** Never follow links or read special files while inspecting untrusted content. */
export declare function skillContentManifest(root: string, ignoreGit?: boolean): {
    digest: string;
    files: string[];
};
export declare function inspectSkill(name: string, evidence?: SkillEvidence): SkillInspection;
/** Rename, rather than copy/delete, so a failed backup leaves the original intact. */
export declare function backupSkill(name: string): SkillBackup;
/** Internal rollback only. Never overwrite a Skill that appeared after backup. */
export declare function restoreSkillBackup(backup: SkillBackup): void;
