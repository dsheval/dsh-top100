/** Read the current DSH profile's installed packages. */
import type { InstalledMap } from "../shared/types.js";
export declare const INBOX_BUNDLES: Set<string>;
/** Match DSH's own profile directory-name rules (dots, spaces, and Unicode are valid). */
export declare function isDshProfileName(profile: string): boolean;
export declare function profileDir(profile: string, explicitDir?: string): string;
export declare function readInstalled(profile: string, explicitDir?: string): InstalledMap;
export interface ProfileManifestSnapshot {
    dependencies: Record<string, string>;
    profileBundles: {
        present: false;
    } | {
        present: true;
        value: unknown;
    };
    lockfile: {
        present: false;
    } | {
        present: true;
        value: string;
    };
}
/** Capture the two package-operation fields mutated by `dsh plugin`. */
export declare function readProfileManifestSnapshot(profile: string, explicitDir?: string): ProfileManifestSnapshot;
/** Restore only the manifest fields owned by a failed package operation. */
export declare function restoreProfileManifest(profile: string, snapshot: ProfileManifestSnapshot, explicitDir?: string): string[];
/** Finish a half-uninstall when the package is already gone from disk. */
export declare function dropFromManifest(profile: string, name: string, explicitDir?: string): boolean;
export declare function readInstalledVersion(profile: string, name: string, explicitDir?: string): string | null;
export declare function readInstalledManifest(profile: string, name: string, explicitDir?: string): {
    name?: string;
    version?: string;
    description?: string;
    homepage?: string;
    repository?: unknown;
} | null;
export declare function argvProfile(argv?: readonly string[]): string | undefined;
export declare function resolveActiveProfile(configured?: string, argv?: readonly string[]): string;
