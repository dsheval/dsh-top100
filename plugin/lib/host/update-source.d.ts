import type { InstallProvenance, UpdateStrategy } from "../shared/types.js";
export declare class UpdateStrategyRequiredError extends Error {
    readonly code = "update-strategy-required";
    constructor(message: string);
}
export interface UpdateSource {
    target: string;
    policy: string;
}
export declare function resolveUpdateSource(name: string, installedSpec: string, options?: {
    version?: string | null;
    provenance?: InstallProvenance | null;
    strategy?: UpdateStrategy;
}): UpdateSource | null;
