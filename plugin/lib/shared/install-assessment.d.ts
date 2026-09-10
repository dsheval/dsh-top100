import { type CatalogInstallSource } from "./install-source.js";
import type { DiscoveryEvidence, InstallSourceAssessment } from "./types.js";
export interface AssessedCatalogEntry extends CatalogInstallSource {
    installRepositoryPath?: string;
    discovery?: DiscoveryEvidence;
    installAssessment?: InstallSourceAssessment;
    install?: NonNullable<CatalogInstallSource["install"]> & {
        repositoryPath?: string;
        discovery?: DiscoveryEvidence;
        assessment?: InstallSourceAssessment;
    };
}
export declare const SOURCE_ASSESSMENT_TTL_MS: number;
export type CatalogSourceStatus = "unidentified" | "identified" | "verified" | "invalid" | "unavailable" | "stale";
/** Bind evidence to source + selected subpackage, not merely the repository name. */
export declare function installSourceKey(entry: AssessedCatalogEntry, profile?: string): string;
export declare function catalogSourceStatus(entry: AssessedCatalogEntry, profile?: string, now?: number): CatalogSourceStatus;
export declare function discoveryNeedsReview(entry: AssessedCatalogEntry): boolean;
