/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, normalizeDataUrl } from "./host/catalog.js";
import { resolveActiveProfile } from "./host/profile.js";
import { mountRoutes } from "./host/routes.js";
import { installRecommendationCapabilities } from "./host/recommendations.js";
import { createDesktopPluginRuntime } from "./install/dsh-cli.js";
export const name = "dsh-top100";
export const inject = ["skills", "tools"];
export const Config = z.object({
    dataUrl: z.string().default(DEFAULT_DATA_URL),
    // Empty means "manage the profile this DSH process booted".
    profile: z.string().default(""),
});
export function apply(ctx, config = { dataUrl: DEFAULT_DATA_URL, profile: "" }) {
    const dataUrl = normalizeDataUrl(process.env.DSH_TOP100_DATA_URL || config.dataUrl || DEFAULT_DATA_URL);
    let sharedInstalled = false;
    const installShared = (resolved) => {
        if (sharedInstalled)
            return;
        sharedInstalled = true;
        void import("./host/settings.js")
            .then((module) => module.installTop100Settings(ctx, resolved))
            .catch(() => undefined);
        installRecommendationCapabilities(ctx, resolved);
    };
    ctx.inject(["webServer"], (hostCtx) => {
        const host = hostCtx;
        // desktopProfiles is intentionally detected here, after host services
        // have mounted, matching DSH Desktop's published plugin contract.
        const desktopProfiles = ctx.get("desktopProfiles");
        if (!desktopProfiles) {
            const resolved = {
                dataUrl,
                profile: resolveActiveProfile(config.profile),
            };
            installShared(resolved);
            host.effect(() => mountRoutes(host, resolved), "dsh-top100: http routes");
            return;
        }
        hostCtx.inject(["desktopPnpm"], (desktopCtx) => {
            const active = desktopProfiles.current;
            const desktopResolved = {
                dataUrl,
                profile: active.name,
                profileDirectory: active.dir,
            };
            installShared(desktopResolved);
            const runtime = createDesktopPluginRuntime(desktopCtx.desktopPnpm, active.dir);
            const desktopHost = desktopCtx;
            desktopHost.effect(() => {
                const disposeRoutes = mountRoutes(desktopHost, desktopResolved, runtime);
                return async () => {
                    disposeRoutes();
                    await runtime.dispose?.();
                };
            }, "dsh-top100: Desktop http routes and package operations");
        });
    });
}
