/** List and mutate installed profile plugins and local skills. */
import type { ManagedPlugin, RankingsDocument } from "../shared/types.js";
export declare function skillsRoot(): string;
export declare function matchCatalogEntry(document: RankingsDocument | null, name: string, spec: string, fullName: string | null): import("../shared/types.js").RankingEntry | undefined;
export declare function fetchNpmLatest(name: string): Promise<string | null>;
/**
 * Pick an author/catalog supplied Chinese description without inventing a
 * translation. English-only metadata falls back to an explicit inventory
 * summary so the management page remains understandable in Chinese.
 */
export declare function managedDescriptionZh(options: {
    kind: "bundle" | "skill";
    name: string;
    descriptionZh?: string | null;
    descriptions?: Array<string | null | undefined>;
}): string;
export declare function resolveUpdateTarget(name: string, spec: string): string | null;
export declare function listManagedPlugins(profile: string, document: RankingsDocument | null, explicitDir?: string): Promise<ManagedPlugin[]>;
export declare function uninstallSkill(name: string): void;
export declare function cleanupAfterUninstall(profile: string, name: string, rowIds?: readonly string[] | undefined, explicitDir?: string): void;
