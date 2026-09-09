/** Durable, profile-scoped source evidence for installs performed by this plugin. */
import type { InstalledSkill } from "../install/skill-install.js";
import type { InstallPreflight } from "../shared/types.js";
import type { PluginResolvedConfig } from "./contracts.js";
export declare function assertProvenanceLedgerReadable(config: PluginResolvedConfig): void;
export declare function recordInstallProvenance(config: PluginResolvedConfig, preflight: InstallPreflight, skills?: InstalledSkill[]): void;
/** Callers must also bind this evidence to the currently installed target. */
export declare function readBundleProvenance(name: string, profile: string, profileDirectory?: string): InstallPreflight["provenance"] | null;
/** Prepare a complete ledger before a caller's multi-file transaction; never writes or creates directories. */
export declare function renderBundleProvenance(config: PluginResolvedConfig, preflights: readonly InstallPreflight[]): string;
/** Skills are global; a missing record in this Profile leaves their modification state unknown. */
export declare function readSkillProvenance(name: string, profile: string, profileDirectory?: string): Pick<InstalledSkill, "digest" | "files"> | null;
