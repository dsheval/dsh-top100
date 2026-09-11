/** Optional settings namespace so operators can change the catalog URL without editing YAML. */
import * as settings from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, invalidateCatalog, normalizeDataUrl } from "./catalog.js";
export const TOP100_SETTINGS_NS = "dsh-top100";
export const Top100Settings = z.object({
    dataUrl: z.string().default(DEFAULT_DATA_URL),
});
export function installTop100Settings(ctx, resolved) {
    const entry = { dataUrl: resolved.dataUrl || DEFAULT_DATA_URL };
    let source = () => entry;
    const hooks = {
        validate: (value) => {
            normalizeDataUrl(value.dataUrl);
        },
        setSource: (current) => {
            source = current;
        },
        onChange: () => {
            resolved.dataUrl = normalizeDataUrl(source().dataUrl);
            invalidateCatalog();
        },
    };
    // 0.1.1 exposed a free helper; 0.1.2+ moved it onto the optional service.
    const legacy = settings;
    if (typeof legacy.installSettingsSection === "function") {
        legacy.installSettingsSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
    }
    else {
        ctx.inject(["settings"], (scoped) => {
            scoped.settings.installSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
        });
    }
}
