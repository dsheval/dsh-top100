/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, normalizeDataUrl } from "./host/catalog.js";
import type { PluginResolvedConfig } from "./host/contracts.js";
import { resolveActiveProfile } from "./host/profile.js";
import { mountRoutes } from "./host/routes.js";
import { installRecommendationCapabilities } from "./host/recommendations.js";
import { createDesktopPluginRuntime, type DesktopPnpmLike } from "./install/dsh-cli.js";

export const name = "dsh-top100";
export const inject = ["skills", "tools"];

export interface Config {
  dataUrl: string;
  profile: string;
}

export const Config: z<Config> = z.object({
  dataUrl: z.string().default(DEFAULT_DATA_URL),
  // Empty means "manage the profile this DSH process booted".
  profile: z.string().default(""),
});

interface DesktopProfilesLike {
  readonly current: { readonly name: string; readonly dir: string };
}

export function apply(ctx: Context, config: Config = { dataUrl: DEFAULT_DATA_URL, profile: "" }): void {
  const dataUrl = normalizeDataUrl(process.env.DSH_TOP100_DATA_URL || config.dataUrl || DEFAULT_DATA_URL);
  let sharedInstalled = false;
  const installShared = (resolved: PluginResolvedConfig): void => {
    if (sharedInstalled) return;
    sharedInstalled = true;
    void import("./host/settings.js")
      .then((module) => module.installTop100Settings(ctx, resolved))
      .catch(() => undefined);
    installRecommendationCapabilities(ctx, resolved);
  };

  ctx.inject(["webServer"], (hostCtx: Context) => {
    const host = hostCtx as unknown as {
      effect(callback: () => () => void | Promise<void>, label: string): void;
      webServer: Parameters<typeof mountRoutes>[0]["webServer"];
    };
    // desktopProfiles is intentionally detected here, after host services
    // have mounted, matching DSH Desktop's published plugin contract.
    const desktopProfiles = ctx.get("desktopProfiles") as DesktopProfilesLike | undefined;
    if (!desktopProfiles) {
      const resolved: PluginResolvedConfig = {
        dataUrl,
        profile: resolveActiveProfile(config.profile),
      };
      installShared(resolved);
      host.effect(() => mountRoutes(host, resolved), "dsh-top100: http routes");
      return;
    }
    hostCtx.inject(["desktopPnpm"], (desktopCtx: Context) => {
      const active = desktopProfiles.current;
      const desktopResolved: PluginResolvedConfig = {
        dataUrl,
        profile: active.name,
        profileDirectory: active.dir,
      };
      installShared(desktopResolved);
      const runtime = createDesktopPluginRuntime(
        (desktopCtx as unknown as { desktopPnpm: DesktopPnpmLike }).desktopPnpm,
        active.dir,
      );
      const desktopHost = desktopCtx as unknown as typeof host;
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
