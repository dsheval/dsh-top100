export interface SourceMigrationItem {
    name: string;
    from: string;
    version: string;
}
export interface SourceMigrationPreflight {
    approvalToken: string;
    items: SourceMigrationItem[];
    expiresAt: number;
}
export declare function preflightSourceMigration(profile: string, explicitDir?: string): SourceMigrationPreflight;
export declare function applySourceMigration(token: string, profile: string, explicitDir?: string): {
    items: SourceMigrationItem[];
    migrated: number;
};
