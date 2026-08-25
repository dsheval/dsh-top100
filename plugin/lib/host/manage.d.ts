/** List and mutate installed profile plugins and local skills. */
import type { ManagedPlugin, RankingsDocument } from "../shared/types.js";
export declare function skillsRoot(): string;
export declare function matchCatalogEntry(document: RankingsDocument | null, name: string, spec: string, fullName: string | null): import("../shared/types.js").RankingEntry | undefined;
export declare function fetchNpmLatest(name: string): Promise<string | null>;
export declare function resolveUpdateTarget(name: string, spec: string): string | null;
export declare function listManagedPlugins(profile: string, document: RankingsDocument | null): Promise<ManagedPlugin[]>;
export declare function uninstallSkill(name: string): void;
export declare function cleanupAfterUninstall(profile: string, name: string): void;
