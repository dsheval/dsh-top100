/** Read the current DSH profile's installed packages. */
import type { InstalledMap } from "./types.js";
export declare function profileDir(profile: string, explicitDir?: string): string;
export declare function readInstalled(profile: string, explicitDir?: string): InstalledMap;
export declare function argvProfile(): string | undefined;
