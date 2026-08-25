/** Optional settings namespace so operators can change the catalog URL without editing YAML. */

import type { Context } from "@deepseek-ai/cordis";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, invalidateCatalog, normalizeDataUrl } from "./catalog.js";
import type { PluginResolvedConfig } from "./contracts.js";

export const TOP100_SETTINGS_NS = settingsNamespace("dsh-top100");

export interface Top100Settings {
  dataUrl: string;
}

export const Top100Settings: z<Top100Settings> = z.object({
  dataUrl: z.string().default(DEFAULT_DATA_URL),
});

export function installTop100Settings(ctx: Context, resolved: PluginResolvedConfig): void {
  const entry = { dataUrl: resolved.dataUrl || DEFAULT_DATA_URL };
  let source = (): Top100Settings => entry;
  installSettingsSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, {
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
  });
}
