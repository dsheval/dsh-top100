/** Host HTTP routes for catalog, install, and status. */
import type { PluginHost, PluginResolvedConfig } from "./contracts.js";
export declare function mountRoutes(host: PluginHost, config: PluginResolvedConfig): () => void;
