/** Host HTTP routes for catalog, install, and status. */
import type { IncomingMessage, ServerResponse } from "node:http";
export interface WebServerService {
    register(route: {
        kind: "exact" | "prefix";
        path: string;
        handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
    }): () => void;
}
export interface PluginHost {
    webServer: WebServerService;
}
export interface PluginResolvedConfig {
    dataUrl: string;
    profile: string;
}
export declare function mountRoutes(host: PluginHost, config: PluginResolvedConfig): () => void;
