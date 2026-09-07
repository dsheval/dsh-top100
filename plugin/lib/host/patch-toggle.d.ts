import { type DshPatch } from "./dsh-patch.js";
export interface PatchState {
    disables: string[];
    forced: string[];
}
export declare function userPatchPath(profile: string, explicitDir?: string): string;
export declare function parseDshPatchText(source: string): DshPatch[] | null;
/** A missing user layer is optional; unreadable or malformed existing files are not. */
export declare function readUserPatch(patchPath: string): DshPatch[];
export declare function userPatchPackageReferences(patchPath: string, packageName: string): string[] | null;
export declare function isProtectedPackage(name: string): boolean;
export declare function userPatchState(patches: readonly DshPatch[], knownRows?: readonly DshPatch[]): PatchState;
export declare function readUserPatchState(patchPath: string): PatchState;
export declare function parseInsertedIds(source: string): string[];
/** Resolve the declared layer only; missing declarations/files must not guess a package-name id. */
export declare function bundlePatchEntries(packageDirectory: string): {
    path: string;
    ids: string[];
    patches: DshPatch[];
};
export declare function rowIdsForPackage(profile: string, packageName: string, explicitDir?: string): string[];
export declare function setRowDisabled(patchPath: string, rowId: string, disabled: boolean): {
    ok: boolean;
    reason: string | null;
};
export declare function removeRowBlocks(patchPath: string, rowIds: readonly string[]): void;
export declare function packageIsDisabled(profile: string, packageName: string, explicitDir?: string): boolean;
export declare function setPackageEnabled(profile: string, packageName: string, enabled: boolean, explicitDir?: string): {
    ok: boolean;
    reason: string;
    rows: string[];
} | {
    ok: boolean;
    reason: null;
    rows: string[];
};
