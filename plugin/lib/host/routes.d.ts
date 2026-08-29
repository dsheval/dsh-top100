/** Host HTTP routes for catalog, install, and status. */
import { type PluginCommandRuntime } from "../install/dsh-cli.js";
import type { PluginHost, PluginResolvedConfig } from "./contracts.js";
export declare function mountRoutes(host: PluginHost, config: PluginResolvedConfig, commandRuntime?: PluginCommandRuntime): () => void;
