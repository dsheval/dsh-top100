/** Small semver helpers for peer-range diagnostics. */
export interface Semver {
    major: number;
    minor: number;
    patch: number;
    pre: string;
}
export declare function parseSemver(value: string): Semver | null;
export declare function compareSemver(left: string, right: string): number;
export declare function satisfiesRange(version: string, range: string): boolean | null;
