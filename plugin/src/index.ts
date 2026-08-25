/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, normalizeDataUrl } from "./host/catalog.js";
import type { PluginResolvedConfig } from "./host/contracts.js";
import { argvProfile } from "./host/profile.js";
import { mountRoutes } from "./host/routes.js";

export const name = "dsh-top100";

export interface Config {
  dataUrl: string;
  profile: string;
}

export const Config: z<Config> = z.object({
  dataUrl: z.string().default(DEFAULT_DATA_URL),
  profile: z.string().default("web"),
});

export function apply(ctx: Context, config: Config = { dataUrl: DEFAULT_DATA_URL, profile: "web" }): void {
  const resolved: PluginResolvedConfig = {
    dataUrl: normalizeDataUrl(process.env.DSH_TOP100_DATA_URL || config.dataUrl || DEFAULT_DATA_URL),
    profile: config.profile || argvProfile() || "web",
  };

  void import("./host/settings.js")
    .then((module) => module.installTop100Settings(ctx, resolved))
    .catch(() => undefined);

  ctx.inject(["webServer"], (hostCtx: Context) => {
    const host = hostCtx as unknown as {
      effect(callback: () => () => void, label: string): void;
      webServer: Parameters<typeof mountRoutes>[0]["webServer"];
    };
    host.effect(() => mountRoutes(host, resolved), "dsh-top100: http routes");
  });
}
