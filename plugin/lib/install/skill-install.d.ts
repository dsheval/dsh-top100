/** Install a catalogued Skill without executing repository code or README commands. */
export interface InstalledSkill {
    name: string;
    alreadyInstalled: boolean;
}
export declare function installSkill(fullName: string, options?: {
    signal?: AbortSignal;
}): Promise<InstalledSkill[]>;
