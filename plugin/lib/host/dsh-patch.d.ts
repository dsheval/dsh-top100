export type DshPatch = Record<string, unknown>;
export declare function readDshPatch(source: string): DshPatch[];
export declare function writeDshPatch(patches: DshPatch[]): string;
/** Visit loader rows only: ordinary plugin configuration is not a loader tree. */
export declare function insertedRows(patches: readonly DshPatch[]): DshPatch[];
/** Static application follows include.applyEntryPatches; !!js remains unevaluated. */
export declare function applyDshPatches(patches: readonly DshPatch[]): DshPatch[];
export declare function disabledRowIds(rows: readonly DshPatch[]): Set<string>;
