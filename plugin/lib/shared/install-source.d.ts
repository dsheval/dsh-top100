export declare const NPM_SPEC_RE: RegExp;
export declare const FULL_NAME_RE: RegExp;
export declare const GITHUB_SPEC_RE: RegExp;
export interface CatalogInstallSource {
    fullName: string;
    type?: string;
    installTarget?: unknown;
    installPackageName?: unknown;
    install?: {
        packageName?: unknown;
        commands?: readonly unknown[];
    };
}
export declare function normalizeInstallTarget(value: unknown): string | null;
/** A # inside a ref or a quoted token is not a shell comment. */
export declare function stripInstallComment(command: string): string;
export declare function parseDshInstallCommand(value: unknown): string | null;
export declare function resolveCatalogInstallTarget(entry: CatalogInstallSource): string | null;
