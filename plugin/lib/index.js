/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, normalizeDataUrl } from "./host/catalog.js";
import { resolveActiveProfile } from "./host/profile.js";
import { mountRoutes } from "./host/routes.js";
import { installRecommendationCapabilities } from "./host/recommendations.js";
export const name = "dsh-top100";
export const inject = ["skills", "tools"];
export const Config = z.object({
    dataUrl: z.string().default(DEFAULT_DATA_URL),
    // Empty means "manage the profile this DSH process booted".
    profile: z.string().default(""),
});
export function apply(ctx, config = { dataUrl: DEFAULT_DATA_URL, profile: "" }) {
    const resolved = {
        dataUrl: normalizeDataUrl(process.env.DSH_TOP100_DATA_URL || config.dataUrl || DEFAULT_DATA_URL),
        profile: resolveActiveProfile(config.profile),
    };
    void import("./host/settings.js")
        .then((module) => module.installTop100Settings(ctx, resolved))
        .catch(() => undefined);
    installRecommendationCapabilities(ctx, resolved);
    ctx.inject(["webServer"], (hostCtx) => {
        const host = hostCtx;
        host.effect(() => mountRoutes(host, resolved), "dsh-top100: http routes");
    });
}
