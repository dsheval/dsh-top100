import type { CatalogItem } from "../shared/types.js";

export type InstallCapabilityKind = "installed" | "ready" | "manual" | "browse";

export interface InstallCapabilityPresentation {
  kind: InstallCapabilityKind;
  labelKey: string;
  reasonKey: string;
}

/** Explain the next user-visible step without conflating structure, trust, and installability. */
export function presentInstallCapability(item: CatalogItem): InstallCapabilityPresentation {
  if (item.installed) {
    return { kind: "installed", labelKey: "capabilityInstalled", reasonKey: "capabilityInstalledReason" };
  }
  if (item.installable && item.install?.needsConfig) {
    return { kind: "manual", labelKey: "capabilityManual", reasonKey: "capabilityManualReason" };
  }
  if (item.installable) {
    return { kind: "ready", labelKey: "capabilityReady", reasonKey: "capabilityReadyReason" };
  }
  if (!item.evidence.compatible) {
    return { kind: "browse", labelKey: "capabilityBrowse", reasonKey: "capabilityUnverifiedReason" };
  }
  return { kind: "browse", labelKey: "capabilityUnavailable", reasonKey: "capabilityNoSourceReason" };
}
