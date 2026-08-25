/** Read-only profile and rankings diagnostics for the Settings page. */
import { type DiagnosticReport, type RankingsDocument } from "../shared/types.js";
export interface DiagnoseOptions {
    profileDir?: string;
    dataUrl?: string;
    document?: RankingsDocument | null;
    fetchCatalog?: boolean;
    now?: number;
}
export declare function buildDiagnosticReport(profile: string, options?: DiagnoseOptions): Promise<DiagnosticReport>;
