/** Durable, profile-scoped source evidence for installs performed by this plugin. */
import type { InstalledSkill } from "../install/skill-install.js";
import type { InstallPreflight } from "../shared/types.js";
import type { PluginResolvedConfig } from "./contracts.js";
export declare function assertProvenanceLedgerReadable(config: PluginResolvedConfig): void;
export declare function recordInstallProvenance(config: PluginResolvedConfig, preflight: InstallPreflight, skills?: InstalledSkill[]): void;
