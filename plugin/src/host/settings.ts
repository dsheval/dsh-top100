/** Optional settings namespace so operators can change the catalog URL without editing YAML. */

import type { Context } from "@deepseek-ai/cordis";
import * as settings from "@deepseek-ai/dsh-settings";
import type { SettingsSectionHooks } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, invalidateCatalog, normalizeDataUrl } from "./catalog.js";
import type { PluginResolvedConfig } from "./contracts.js";

export const TOP100_SETTINGS_NS = "dsh-top100";

export interface Top100Settings {
  dataUrl: string;
}

export const Top100Settings: z<Top100Settings> = z.object({
  dataUrl: z.string().default(DEFAULT_DATA_URL),
});

export function installTop100Settings(ctx: Context, resolved: PluginResolvedConfig): void {
  const entry = { dataUrl: resolved.dataUrl || DEFAULT_DATA_URL };
  let source = (): Top100Settings => entry;
  const hooks: SettingsSectionHooks<Top100Settings> = {
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
  const legacy = settings as unknown as {
    installSettingsSection?: (
      owner: Context, namespace: string, schema: z<Top100Settings>,
      base: Top100Settings, hooks: SettingsSectionHooks<Top100Settings>,
    ) => void;
  };
  if (typeof legacy.installSettingsSection === "function") {
    legacy.installSettingsSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
  } else {
    ctx.inject(["settings"], (scoped) => {
      scoped.settings.installSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
    });
  }
}
