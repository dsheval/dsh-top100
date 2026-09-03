/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */
import type { InstallSpec, RankingEntry } from "../shared/types.js";
import { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE } from "../shared/install-source.js";
export { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE };
export declare const SAFE_TARGET_RE: RegExp;
export declare function isCordisEntry(entry: Pick<RankingEntry, "type" | "install">): boolean;
export declare function parseInstallSpec(raw: string): InstallSpec | null;
export declare function npmPackageSpec(spec: string): {
    name: string;
    selector: string | null;
} | null;
export declare function resolveInstallSpec(entry: RankingEntry): InstallSpec | null;
export declare function isInstalledEntry(entry: RankingEntry, installed: Record<string, string>): boolean;
