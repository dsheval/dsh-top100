export interface InstalledSkill {
    name: string;
    alreadyInstalled: boolean;
}
/** Clone a catalogued GitHub repository and copy validated skills into ~/.dsh/skills. */
export declare function installSkill(fullName: string, options?: {
    signal?: AbortSignal;
}): Promise<InstalledSkill[]>;
