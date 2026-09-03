import type { InstallRiskEvidence } from "../shared/types.js";

/** Scripts and ordinary restart guidance have their own always-visible compact rows. */
export function visibleInstallReviewRisks(risks: InstallRiskEvidence[], scriptCount: number): InstallRiskEvidence[] {
  return risks.filter((risk) => {
    if (risk.code === "lifecycle-scripts" && scriptCount > 0) return false;
    if (risk.code === "restart-required" && risk.severity === "info") return false;
    return true;
  });
}
