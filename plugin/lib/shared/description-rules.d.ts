export interface DescriptionEntry {
    fullName?: string;
    description?: string;
    descriptionZh?: string;
    descriptionStatus?: DescriptionStatus;
    readmeSummary?: string;
    type?: string;
    install?: {
        packageName?: string | null;
        repositoryPath?: string | null;
        discovery?: {
            evidence: string[];
            status?: string;
            readme?: {
                documentSha256: string;
            };
        };
    };
    installPackageName?: string | null;
    installRepositoryPath?: string | null;
}
export interface DescriptionStatus {
    state: 'pending' | 'review-required' | 'missing-source' | 'retry';
    reason: string;
}
export interface ReviewedInstallIdentity {
    packageName: string | null;
    repositoryPath: string | null;
    functionEvidence?: string;
}
/** Full and compact catalogs must identify the same reviewed package. */
export declare function matchesReviewedIdentity(entry: Pick<DescriptionEntry, 'install' | 'installPackageName' | 'installRepositoryPath' | 'type'>, sourceInstall?: ReviewedInstallIdentity, sourceType?: string | null): boolean;
export interface DescriptionContext {
    snapshotId?: string;
}
export interface ReviewedDescription {
    sourceScope?: string;
    /** Explicitly reviewed revisions; never a wildcard for subsequent changes. */
    sourceVariants?: Array<{
        sourceDescription: string;
        sourceReadme: string;
    }>;
    /** Checked full documents also catch changes beyond the legacy short excerpt. */
    sourceDocumentHashes?: string[];
    /** Opt-in migrations cannot recover unreviewed text from old caches. */
    enforceSourceMatch?: boolean;
    /** A deliberate hold survives metadata changes until explicitly resolved. */
    reviewRequiredReason?: string;
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
/** The same approved source set is used by the collector and both clients. */
export declare function matchesReviewedDescriptionSource(entry: DescriptionEntry, review: ReviewedDescription, context?: DescriptionContext, allowSelectedRootDescription?: boolean): boolean;
/** A leading language switch is navigation, not a change to reviewed functionality.
 * Keep the rest of the source exact, including numbers, versions and missing text.
 */
export declare function matchesReviewedReadme(current: string, reviewed: string): boolean;
/** Allow product names, but a few Chinese words must not validate an English paragraph. */
export declare function isChineseDescription(value: string): boolean;
/** Shared display rules; raw repository text is always rendered via textContent. */
export declare function cleanDescription(value: unknown): string;
export declare function isPlaceholder(value: string): boolean;
/** Reject recognisable non-descriptions, not a claim of semantic verification.
 * Shared by collection, model-output validation, coverage and both clients.
 */
export declare function descriptionQualityIssue(value: string | null | undefined): string | null;
export declare function isUsableChineseDescription(value: string): boolean;
export declare function hasInvalidSelectedPackage(entry: Pick<DescriptionEntry, 'install'>): boolean;
export declare function descriptionFor(entry: DescriptionEntry, reviewed?: ReviewedDescriptions, context?: DescriptionContext): string;
/** Status text is for display only; it must never count as a completed summary. */
export declare function descriptionDisplayFor(entry: DescriptionEntry, reviewed?: ReviewedDescriptions, context?: DescriptionContext): string;
