import targets from "../config/reviewed-plugin-targets.json";
import type { Detection, ReviewedPackageTarget } from "./detect.js";
import type { DshPlugin } from "@dsh-top100/schema";
import { PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";

/** These records select an audited package; the detector must still validate it. */
export const reviewedPluginTargets: Readonly<Record<string, ReviewedPackageTarget>> = targets;

export function matchesReviewedTarget(detection: Pick<Detection, "isPlugin" | "packageName" | "pluginPath">, target?: ReviewedPackageTarget): boolean {
  return !target || (detection.isPlugin && detection.packageName === target.packageName
    && detection.pluginPath === target.repositoryPath);
}

/** Preserve metadata on a failed refresh without resurrecting a known wrong package. */
export function quarantineUnreviewedTarget(plugin: DshPlugin, target?: ReviewedPackageTarget, structurallyInvalid = false): DshPlugin {
  if (!target || (!structurallyInvalid && matchesReviewedTarget({ isPlugin: true,
    packageName: plugin.install.packageName ?? null, pluginPath: plugin.install.repositoryPath ?? null }, target))) return plugin;
  const discovery = plugin.install.discovery;
  return { ...plugin, readmeSummary: null, descriptionZh: PENDING_DESCRIPTION_ZH, categories: [], tags: [...plugin.topics],
    install: { method: plugin.install.method, needsConfig: plugin.install.needsConfig,
      discovery: { status: "review-required", kind: discovery?.kind ?? "host",
        evidence: [`Reviewed target ${target.repositoryPath ?? "."} (${target.packageName}) requires validation; prior installation identity withheld`],
        checkedAt: discovery?.checkedAt ?? plugin.lastCheckedAt, policyVersion: discovery?.policyVersion ?? 0,
        sourceRevision: discovery?.sourceRevision ?? plugin.pushedAt } } };
}
