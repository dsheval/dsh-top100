import type { DshPlugin } from "@dsh-top100/schema";
import { reviewedFunctionEvidence, FUNCTION_EVIDENCE_MARKER_PREFIX, type FunctionEvidenceCheck } from "./reviewed-evidence.js";
import { PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";

type EvidenceSource = { fullName?: string; id?: string | number; name?: string; type?: string;
  install?: { packageName?: string | null; repositoryPath?: string | null; discovery?: { evidence: string[] } } | null };
export function functionEvidenceMarker(entry: EvidenceSource): string | null {
  return entry.install?.discovery?.evidence.find(value => value.startsWith(FUNCTION_EVIDENCE_MARKER_PREFIX)) ?? null;
}
export function needsFunctionReview(entry: EvidenceSource): boolean {
  const review = reviewedFunctionEvidence[String(entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase()];
  return !!review && (entry.type !== "cordis-plugin" || entry.install?.packageName !== review.packageName
    || entry.install?.repositoryPath !== review.repositoryPath
    || functionEvidenceMarker(entry) !== FUNCTION_EVIDENCE_MARKER_PREFIX + review.expectedFingerprint);
}

/** Keep old content only after an inconclusive read of the same already-reviewed package. */
export function applyFunctionEvidenceCheck(current: DshPlugin, previous: DshPlugin | undefined, check: FunctionEvidenceCheck): DshPlugin {
  if (check.status === "not-required") return current;
  const discovery = current.install.discovery;
  if (check.status === "matched" && check.marker && discovery) {
    return { ...current, install: { ...current.install, discovery: { ...discovery,
      evidence: [...discovery.evidence.filter(value => !value.startsWith(FUNCTION_EVIDENCE_MARKER_PREFIX)), check.marker] } } };
  }
  if (check.status === "unavailable" && previous && !needsFunctionReview(previous)
    && current.fullName.toLowerCase() === previous.fullName.toLowerCase()
    && !!check.expectedFingerprint && functionEvidenceMarker(previous) === FUNCTION_EVIDENCE_MARKER_PREFIX + check.expectedFingerprint
    && current.type === previous.type && current.install.packageName === previous.install.packageName
    && current.install.repositoryPath === previous.install.repositoryPath) {
    return { ...current, description: previous.description, readmeSummary: previous.readmeSummary,
      descriptionZh: previous.descriptionZh, categories: previous.categories, tags: [...previous.tags],
      install: { ...previous.install, discovery: { ...previous.install.discovery!, status: "review-required",
        evidence: [...new Set([...previous.install.discovery!.evidence, "Current function evidence unavailable; retaining previously verified source."])] } } };
  }
  return { ...current, descriptionZh: PENDING_DESCRIPTION_ZH, categories: [], tags: [...current.topics],
    install: { ...current.install, ...(discovery ? { discovery: { ...discovery, status: "review-required",
      evidence: [...discovery.evidence.filter(value => !value.startsWith(FUNCTION_EVIDENCE_MARKER_PREFIX)), check.reason] } } : {}) } };
}
