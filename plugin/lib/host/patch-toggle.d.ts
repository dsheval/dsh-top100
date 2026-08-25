/** Persist enable/disable through the profile user patch layer. */
export interface PatchState {
    disables: string[];
    forced: string[];
}
export declare function userPatchPath(profile: string, explicitDir?: string): string;
export declare function isProtectedPackage(name: string): boolean;
export declare function readUserPatchState(patchPath: string): PatchState;
export declare function parseInsertedIds(text: string): string[];
export declare function rowIdsForPackage(profile: string, packageName: string, explicitDir?: string): string[];
export declare function setRowDisabled(patchPath: string, rowId: string, disabled: boolean): {
    ok: boolean;
    reason: string | null;
};
export declare function removeRowBlocks(patchPath: string, rowIds: readonly string[]): void;
export declare function packageIsDisabled(profile: string, packageName: string, explicitDir?: string): boolean;
export declare function setPackageEnabled(profile: string, packageName: string, enabled: boolean, explicitDir?: string): {
    rows: string[];
    ok: boolean;
    reason: string | null;
};
