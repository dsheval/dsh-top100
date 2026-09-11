import { createHash } from "node:crypto";
import configuration from "../config/reviewed-function-evidence.json";

export interface ReviewedFunctionFile { path: string; sha256: string; }
export interface ReviewedFunctionEvidence {
  packageName: string;
  repositoryPath: string;
  sourceCommit: string;
  expectedFingerprint: string;
  files: ReviewedFunctionFile[];
}

/** Only four source-reviewed packages without a README opt into this check. */
export const reviewedFunctionEvidence: Readonly<Record<string, ReviewedFunctionEvidence>> = configuration;
export const FUNCTION_EVIDENCE_MARKER_PREFIX = "reviewed-function-sha256:";

export function functionEvidenceFingerprint(identity: Pick<ReviewedFunctionEvidence, "packageName" | "repositoryPath">,
  files: readonly ReviewedFunctionFile[]): string {
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256").update(JSON.stringify([
    identity.packageName, identity.repositoryPath, ordered.map(file => [file.path, file.sha256]),
  ])).digest("hex");
}

export interface FunctionEvidenceCheck {
  status: "not-required" | "matched" | "changed" | "unavailable" | "identity-mismatch";
  expectedFingerprint: string | null;
  /** Present only after every current file has been read successfully. */
  fingerprint: string | null;
  /** Only matched evidence may mint a validation marker. */
  marker: string | null;
  reason: string;
}

/** No IO except the injected reader: callers pin one current ref for all files.
 * null means confirmed missing; throwing means an inconclusive/transient read.
 * Neither case manufactures a fresh successful validation. Existing evidence
 * may be retained on unavailable reads only by the caller's same-source policy.
 */
export async function checkReviewedFunctionEvidence(fullName: string,
  identity: { packageName?: string | null; repositoryPath?: string | null },
  readFile: (path: string) => Promise<string | null>,
): Promise<FunctionEvidenceCheck> {
  return verifyReviewedFunctionEvidence(reviewedFunctionEvidence[fullName.toLowerCase()], identity, readFile);
}

/** Pure review verifier, also usable with offline fixtures. */
export async function verifyReviewedFunctionEvidence(review: ReviewedFunctionEvidence | undefined,
  identity: { packageName?: string | null; repositoryPath?: string | null },
  readFile: (path: string) => Promise<string | null>,
): Promise<FunctionEvidenceCheck> {
  const result = (status: FunctionEvidenceCheck["status"], reason: string,
    fingerprint: string | null = null): FunctionEvidenceCheck => ({
    status, expectedFingerprint: review?.expectedFingerprint ?? null, fingerprint,
    marker: status === "matched" ? `${FUNCTION_EVIDENCE_MARKER_PREFIX}${fingerprint}` : null, reason,
  });
  if (!review) return result("not-required", "No scoped source-file review.");
  if (identity.packageName !== review.packageName || identity.repositoryPath !== review.repositoryPath) {
    return result("identity-mismatch", "Selected package differs from reviewed source-file identity.");
  }
  if (!review.files.length || functionEvidenceFingerprint(review, review.files) !== review.expectedFingerprint) {
    throw new Error("Invalid reviewed function evidence configuration");
  }
  const reads = await Promise.allSettled(review.files.map(async file => {
    const text = await readFile(file.path);
    return { path: file.path, sha256: text === null ? null : createHash("sha256").update(text).digest("hex") };
  }));
  const changed = reads.flatMap((read, index) => read.status === "fulfilled"
    && read.value.sha256 !== review.files[index].sha256 ? [review.files[index].path] : []);
  // Observed changes take precedence over a separate inconclusive read.
  if (changed.length) return result("changed", `Reviewed source files changed or disappeared: ${changed.join(", ")}`);
  if (reads.some(read => read.status === "rejected")) return result("unavailable", "Could not verify all reviewed source files.");
  const files = reads.map(read => (read as PromiseFulfilledResult<{ path: string; sha256: string }>).value);
  const fingerprint = functionEvidenceFingerprint(review, files);
  return result("matched", "All scoped source-file hashes match the reviewed evidence.", fingerprint);
}
