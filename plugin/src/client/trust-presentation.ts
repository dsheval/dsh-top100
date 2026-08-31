/** Locale-aware presentation for host-provided trust and install evidence. */

import type {
  CatalogEvidence,
  InstallRiskEvidence,
  InstallSpec,
} from "../shared/types.js";
import type { Translate } from "./locales.js";

const SIGNAL_KEYS = {
  indexed: "evidenceSignalIndexed",
  "dsh-skill": "evidenceSignalDshSkill",
  "agent-skill": "evidenceSignalAgentSkill",
  "theme-bundle": "evidenceSignalThemeBundle",
  "dsh-bundle": "evidenceSignalDshBundle",
  "install-source": "evidenceSignalInstallSource",
} as const;

export interface PresentedEvidence {
  signals: string[];
  caveat: string;
}

export interface PresentedRisk {
  summary: string;
  detail: string;
}

export function presentCatalogEvidence(
  evidence: CatalogEvidence,
  installKind: InstallSpec["kind"] | null,
  t: Translate,
): PresentedEvidence {
  const signals = evidence.signalCodes.map((code) => {
    const label = t(SIGNAL_KEYS[code]);
    return code === "install-source" && installKind ? `${label} (${installKind})` : label;
  });
  return {
    signals,
    caveat: evidence.caveatCode === "not-security-review"
      ? t("evidenceCaveatNotSecurityReview")
      : evidence.caveat,
  };
}

export function presentInstallRisk(risk: InstallRiskEvidence, t: Translate): PresentedRisk {
  const summary = t(`risk_${risk.code}_summary`);
  const detail = risk.code === "lifecycle-scripts"
    ? risk.detail
    : t(`risk_${risk.code}_detail`);
  return { summary, detail };
}
