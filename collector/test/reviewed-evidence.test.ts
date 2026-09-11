import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkReviewedFunctionEvidence, functionEvidenceFingerprint, reviewedFunctionEvidence,
  verifyReviewedFunctionEvidence, type ReviewedFunctionEvidence } from "../src/reviewed-evidence.js";

const identity = { packageName: "@fixture/widget", repositoryPath: "packages/widget" };
const contents = new Map([["packages/widget/index.ts", "export const action = 'read'"],
  ["packages/widget/cordis.patch.yml", "- insert: [{ name: '@fixture/widget' }]"]]);
const files = [...contents].map(([path, text]) => ({ path, sha256: createHash("sha256").update(text).digest("hex") }));
const review: ReviewedFunctionEvidence = { ...identity, sourceCommit: "fixture-commit", files,
  expectedFingerprint: functionEvidenceFingerprint(identity, files) };

describe("scoped source-file evidence", () => {
  it("checks only the five reviewed no-README packages and validates their concrete manifests", () => {
    expect(Object.keys(reviewedFunctionEvidence).sort()).toEqual([
      "dataelement/dsh-desktop", "derpyu520/qq-bridge", "hust-open-atom-club/oh-dsh", "jingyunstudio/jingyun-dsh", "zhu1090093659/dsh-trading",
    ]);
    for (const value of Object.values(reviewedFunctionEvidence)) {
      expect(value.files.length).toBeGreaterThan(1);
      expect(functionEvidenceFingerprint(value, value.files)).toBe(value.expectedFingerprint);
      expect(new Set(value.files.map(file => file.path)).size).toBe(value.files.length);
      for (const file of value.files) {
        expect(file.path.startsWith(`${value.repositoryPath}/`)).toBe(true);
        expect(file.path.split("/")).not.toContain("..");
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it("mints a marker only when every exact current file and the package identity match", async () => {
    const read = vi.fn(async (path: string) => contents.get(path) ?? null);
    const checked = await verifyReviewedFunctionEvidence(review, identity, read);
    expect(checked).toMatchObject({ status: "matched", expectedFingerprint: review.expectedFingerprint,
      fingerprint: review.expectedFingerprint, marker: `reviewed-function-sha256:${review.expectedFingerprint}` });
    expect(read.mock.calls.map(([path]) => path).sort()).toEqual([...contents.keys()].sort());
    expect(functionEvidenceFingerprint(identity, [...files].reverse())).toBe(review.expectedFingerprint);
  });

  it("does not fetch or invalidate records outside the small cohort", async () => {
    const read = vi.fn();
    expect(await checkReviewedFunctionEvidence("unrelated/project", identity, read)).toMatchObject({
      status: "not-required", fingerprint: null, marker: null, expectedFingerprint: null,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["@fixture/other", null])("rejects wrong package %j before reading sources", async packageName => {
    const read = vi.fn();
    expect(await verifyReviewedFunctionEvidence(review, { ...identity, packageName }, read))
      .toMatchObject({ status: "identity-mismatch", marker: null, fingerprint: null });
    expect(read).not.toHaveBeenCalled();
  });

  it("cannot retain a source review after a functional edit or confirmed deletion", async () => {
    for (const newText of ["export const action = 'write'", null]) {
      const checked = await verifyReviewedFunctionEvidence(review, identity,
        async path => path.endsWith("index.ts") ? newText : contents.get(path)!);
      expect(checked).toMatchObject({ status: "changed", marker: null, fingerprint: null });
      expect(checked.reason).toContain("packages/widget/index.ts");
    }
  });

  it("never calls a failed network read a new validation or exposes the error body", async () => {
    const checked = await verifyReviewedFunctionEvidence(review, identity, async () => { throw new Error("private provider detail"); });
    expect(checked).toMatchObject({ status: "unavailable", marker: null, fingerprint: null });
    expect(JSON.stringify(checked)).not.toContain("private provider detail");
  });

  it("does not hide a confirmed functional change behind another unavailable file", async () => {
    const checked = await verifyReviewedFunctionEvidence(review, identity, async path => {
      if (path.endsWith("index.ts")) return "export {}";
      throw new Error("network failed");
    });
    expect(checked).toMatchObject({ status: "changed", marker: null });
  });

  it("fails closed on a corrupt expected fingerprint before fetching", async () => {
    const read = vi.fn();
    await expect(verifyReviewedFunctionEvidence({ ...review, expectedFingerprint: "0".repeat(64) }, identity, read))
      .rejects.toThrow("Invalid reviewed function evidence configuration");
    expect(read).not.toHaveBeenCalled();
  });
});
