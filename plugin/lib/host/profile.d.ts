/** Read the current DSH profile's installed packages. */
import type { InstalledMap } from "../shared/types.js";
export declare const INBOX_BUNDLES: Set<string>;
export declare function profileDir(profile: string, explicitDir?: string): string;
export declare function readInstalled(profile: string, explicitDir?: string): InstalledMap;
export declare function readInstalledVersion(profile: string, name: string, explicitDir?: string): string | null;
export declare function readInstalledManifest(profile: string, name: string, explicitDir?: string): {
    name?: string;
    version?: string;
    description?: string;
    homepage?: string;
    repository?: unknown;
} | null;
export declare function argvProfile(): string | undefined;
