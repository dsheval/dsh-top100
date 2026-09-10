export interface DescriptionEntry {
    fullName?: string;
    description?: string;
    descriptionZh?: string;
    readmeSummary?: string;
    type?: string;
    install?: {
        packageName?: string | null;
        repositoryPath?: string | null;
    };
    installPackageName?: string | null;
    installRepositoryPath?: string | null;
}
export interface ReviewedInstallIdentity {
    packageName: string | null;
    repositoryPath: string | null;
}
/** Full and compact catalogs must identify the same reviewed package. */
export declare function matchesReviewedIdentity(entry: Pick<DescriptionEntry, 'install' | 'installPackageName' | 'installRepositoryPath' | 'type'>, sourceInstall?: ReviewedInstallIdentity, sourceType?: string | null): boolean;
export interface DescriptionContext {
    snapshotId?: string;
}
export interface ReviewedDescription {
    descriptionZh: string;
    /** Withdraw a known incorrect description until this exact source is reviewed again. */
    suspended?: boolean;
    sourceDescription: string;
    sourceReadme: string;
    snapshotId?: string;
    sourceInstall?: ReviewedInstallIdentity;
    sourceType?: string | null;
}
export type ReviewedDescriptions = Record<string, ReviewedDescription>;
export declare const PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
/** Allow product names, but a few Chinese words must not validate an English paragraph. */
export declare function isChineseDescription(value: string): boolean;
/** Shared display rules; raw repository text is always rendered via textContent. */
export declare function cleanDescription(value: unknown): string;
export declare function isPlaceholder(value: string): boolean;
export declare function descriptionFor(entry: DescriptionEntry, reviewed?: ReviewedDescriptions, context?: DescriptionContext): string;
