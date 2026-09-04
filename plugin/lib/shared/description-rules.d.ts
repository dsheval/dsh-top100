export interface DescriptionEntry {
    fullName?: string;
    description?: string;
    descriptionZh?: string;
    readmeSummary?: string;
}
export interface DescriptionContext {
    snapshotId?: string;
}
export interface ReviewedDescription {
    descriptionZh: string;
    sourceDescription: string;
    sourceReadme: string;
    snapshotId?: string;
}
export type ReviewedDescriptions = Record<string, ReviewedDescription>;
/** Shared display rules; raw repository text is always rendered via textContent. */
export declare function cleanDescription(value: unknown): string;
export declare function isPlaceholder(value: string): boolean;
export declare function descriptionFor(entry: DescriptionEntry, reviewed?: ReviewedDescriptions, context?: DescriptionContext): string;
