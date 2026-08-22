/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, normalizeDataUrl } from "./catalog.js";
import { argvProfile } from "./profile.js";
import { mountRoutes } from "./routes.js";
export const name = "dsh-top100";
export const Config = z.object({
    dataUrl: z.string().default(DEFAULT_DATA_URL),
    profile: z.string().default("web"),
});
export function apply(ctx, config = { dataUrl: DEFAULT_DATA_URL, profile: "web" }) {
    const resolved = {
        dataUrl: normalizeDataUrl(process.env.DSH_TOP100_DATA_URL || config.dataUrl || DEFAULT_DATA_URL),
        profile: config.profile || argvProfile() || "web",
    };
    void import("./settings.js")
        .then((module) => module.installTop100Settings(ctx, resolved))
        .catch(() => undefined);
    ctx.inject(["webServer"], (hostCtx) => {
        const host = hostCtx;
        host.effect(() => mountRoutes(host, resolved), "dsh-top100: http routes");
    });
}
