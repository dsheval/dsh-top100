/** Optional settings namespace so operators can change the catalog URL without editing YAML. */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { PluginResolvedConfig } from "./contracts.js";
export declare const TOP100_SETTINGS_NS: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export interface Top100Settings {
    dataUrl: string;
}
export declare const Top100Settings: z<Top100Settings>;
export declare function installTop100Settings(ctx: Context, resolved: PluginResolvedConfig): void;
