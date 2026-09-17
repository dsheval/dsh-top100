/** Presentation contract only. Editorial decisions belong to the publisher. */
export declare const DESCRIPTION_POLICY: "server-v1";
export declare const PENDING_DESCRIPTION_ZH = "\u4E2D\u6587\u7B80\u4ECB\u5F85\u751F\u6210\u3002";
export interface DescriptionStatus {
    state: 'pending' | 'review-required' | 'missing-source' | 'retry' | 'stale';
    /** Stale model output uses generatedAt; a reviewed version uses reviewedAt. */
    origin?: 'model';
    generatedAt?: string;
    reviewedAt?: string;
    reason: string;
}
export interface DescriptionEntry {
    descriptionPolicy?: string;
    descriptionZh?: string | null;
    descriptionStatus?: DescriptionStatus;
}
/** Shared display rules; raw repository text is always rendered via textContent. */
export declare function cleanDescription(value: unknown): string;
/** Validate the calendar date without accepting JavaScript's invalid-date rollover. */
export declare function isDescriptionReviewDate(value: unknown): value is string;
/** Invalid server status fails closed; clients do not invent missing review evidence. */
export declare function descriptionStatusFor(value: unknown): DescriptionStatus | undefined;
/** Never infer a summary from author metadata, a README or an older local review. */
export declare function descriptionFor(entry: DescriptionEntry): string;
export declare function descriptionDisplayFor(entry: DescriptionEntry): string;
