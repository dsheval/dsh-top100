import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DshPlugin } from "@dsh-top100/schema";
import reviews from "../config/reviewed-categories.json";
import { applyFunctionEvidenceCheck, functionEvidenceMarker, needsFunctionReview } from "../src/reviewed-evidence-state.js";
import { reviewedFunctionEvidence, FUNCTION_EVIDENCE_MARKER_PREFIX, type FunctionEvidenceCheck } from "../src/reviewed-evidence.js";
import { CATEGORY_POLICY_VERSION, bindCategoryAssignments } from "../src/categories.js";
import { contentSourceHash, DESCRIPTION_POLICY_VERSION, matchingEditorialHold } from "../src/content-source.js";
import { carryForwardDailyCategories, planDailyCategories } from "../src/daily-categories.js";
import { prepareDailyDescriptions } from "../src/daily-descriptions.js";
import { reviewedCategories, reviewedDescription } from "../src/editorial.js";
import { PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";

const id = "zhu1090093659/dsh-trading";
const evidence = reviewedFunctionEvidence[id];
const marker = FUNCTION_EVIDENCE_MARKER_PREFIX + evidence.expectedFingerprint;
const oldText = "这是之前经源码复核的交易工作台简介，应当只在相同有效证据下复用。";
function source(withMarker = true): DshPlugin {
  const review = reviews[id];
  const entry = { id, fullName: id, name: "dsh-trading", type: "cordis-plugin", stars: 159,
    description: review.sourceDescription, descriptionZh: oldText, readmeSummary: review.sourceReadme || null,
    topics: ["dsh"], tags: ["dsh", "旧内容标签"], pushedAt: "2026-09-10T01:00:00Z", lastCheckedAt: "2026-09-10T01:00:00Z",
    install: { method: "pnpm-profile", packageName: evidence.packageName, repositoryPath: evidence.repositoryPath,
      needsConfig: false, discovery: { status: "verified", kind: "bundle", policyVersion: 6,
        sourceRevision: evidence.sourceCommit, checkedAt: "2026-09-10T01:00:00Z", evidence: withMarker ? [marker] : ["legacy declaration"] } },
  } as DshPlugin;
  entry.categories = bindCategoryAssignments(entry, [{ id: "tools", source: "manual", confidence: 0.99,
    evidence: "旧工作台用途", classifiedAt: "2026-09-10T01:00:00Z" }]);
  return entry;
}
function check(status: FunctionEvidenceCheck["status"]): FunctionEvidenceCheck {
  return { status, expectedFingerprint: evidence.expectedFingerprint,
    fingerprint: status === "matched" ? evidence.expectedFingerprint : null,
    marker: status === "matched" ? marker : null, reason: `Fixture ${status}` };
}

describe("function-evidence persistence and daily reuse", () => {
  it.each(["changed", "identity-mismatch"] as const)("blocks old content, completed jobs and cache replay after %s", status => {
    const previous = source();
    const current = applyFunctionEvidenceCheck({ ...source(), pushedAt: "2026-09-11T01:00:00Z" }, previous, check(status));
    expect(functionEvidenceMarker(current)).toBeNull();
    expect(needsFunctionReview(current)).toBe(true);
    expect(matchingEditorialHold(current)).not.toBeNull();
    expect(contentSourceHash(previous, "description")).not.toBe(contentSourceHash(current, "description"));
    expect(contentSourceHash(previous, "categories")).not.toBe(contentSourceHash(current, "categories"));
    expect(reviewedDescription(current)).toBe(PENDING_DESCRIPTION_ZH);
    expect(reviewedCategories(current)).toEqual([]);

    // Even a legacy cache claiming the now-markerless hash cannot override the hold.
    const descriptionHash = contentSourceHash(current, "description");
    const descriptions = prepareDailyDescriptions([current], new Map([[id, previous]]), new Map([[id, {
      sourceHash: descriptionHash, descriptionZh: oldText, tagsZh: ["旧内容标签"],
    }]]), { [id]: { sourceHash: descriptionHash, status: "complete", attempts: 1, descriptionZh: oldText } }, new Set(), Date.now());
    expect(current.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
    expect(descriptions.jobs[id].status).toBe("review-required");
    expect(descriptions.ready).toEqual([]);

    current.categories = previous.categories;
    carryForwardDailyCategories([current], new Map([[id, previous]]));
    const categoryHash = contentSourceHash(current, "categories");
    const categories = planDailyCategories([current], { previous: { schemaVersion: 1, jobs: { [id]: {
      sourceHash: categoryHash, policyVersion: CATEGORY_POLICY_VERSION, status: "complete", attempts: 1,
      categories: previous.categories,
    } } }, cache: new Map([[id, { sourceHash: categoryHash, categories: previous.categories! }]]) });
    expect(current.categories).toEqual([]);
    expect(categories.state.jobs[id].status).toBe("review-required");
    expect(categories.ready).toEqual([]);
  });

  it("retains a verified same-package source after unavailable reads, without a fresh verification time", () => {
    const previous = source();
    const current = { ...source(false), stars: 190, description: "Unverified new description", readmeSummary: "Unverified new README",
      pushedAt: "2026-09-11T01:00:00Z" };
    const kept = applyFunctionEvidenceCheck(current, previous, check("unavailable"));
    expect(kept.stars).toBe(190);
    expect(kept.pushedAt).toBe(current.pushedAt);
    expect(kept.description).toBe(previous.description);
    expect(kept.readmeSummary).toBe(previous.readmeSummary);
    expect(kept.descriptionZh).toBe(previous.descriptionZh);
    expect(kept.categories).toEqual(previous.categories);
    expect(functionEvidenceMarker(kept)).toBe(marker);
    expect(needsFunctionReview(kept)).toBe(false);
    expect(kept.install.discovery!.status).toBe("review-required");
    expect(kept.install.discovery!.checkedAt).toBe(previous.install.discovery!.checkedAt);
    expect(kept.install.discovery!.sourceRevision).toBe(previous.install.discovery!.sourceRevision);
    expect(current.description).toBe("Unverified new description");
  });

  it.each(["absent", "without-marker", "wrong-marker", "wrong-package", "wrong-repository"] as const)
    ("cannot retain %s previous source when current reads are unavailable", kind => {
      let previous: DshPlugin | undefined = source();
      if (kind === "absent") previous = undefined;
      if (kind === "without-marker") previous = source(false);
      if (kind === "wrong-marker") previous!.install.discovery!.evidence = [FUNCTION_EVIDENCE_MARKER_PREFIX + "f".repeat(64)];
      if (kind === "wrong-package") previous!.install.packageName = "@dshtrading/all";
      if (kind === "wrong-repository") { previous!.fullName = "different/project"; previous!.id = "different/project"; }
      const withheld = applyFunctionEvidenceCheck(source(false), previous, check("unavailable"));
      expect(withheld.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
      expect(withheld.categories).toEqual([]);
      expect(functionEvidenceMarker(withheld)).toBeNull();
      expect(needsFunctionReview(withheld)).toBe(true);
    });

  it("rejects absent evidence and mismatched identities even if old fields remain populated", () => {
    for (const current of [source(false), { ...source(), install: { ...source().install, repositoryPath: "packages/all" } }]) {
      expect(needsFunctionReview(current)).toBe(true);
      expect(reviewedDescription(current)).toBe(PENDING_DESCRIPTION_ZH);
      expect(reviewedCategories(current)).toEqual([]);
      expect(matchingEditorialHold(current)).not.toBeNull();
    }
  });

  it("accepts numeric database ids while resolving the actual repository name", () => {
    expect(needsFunctionReview({ ...source(false), id: 123 })).toBe(true);
    expect(needsFunctionReview({ id: 123, type: "cordis-plugin" })).toBe(false);
  });

  it("replaces obsolete markers on a newly successful check", () => {
    const current = source(false);
    current.install.discovery!.evidence.push(FUNCTION_EVIDENCE_MARKER_PREFIX + "0".repeat(64));
    const updated = applyFunctionEvidenceCheck(current, undefined, check("matched"));
    expect(updated.install.discovery!.evidence.filter(value => value.startsWith(FUNCTION_EVIDENCE_MARKER_PREFIX))).toEqual([marker]);
    expect(needsFunctionReview(updated)).toBe(false);
  });

  it.each(["description", "categories"] as const)("keeps the legacy %s hash byte-for-byte outside this cohort", kind => {
    const unrelated = { ...source(), id: "unrelated/project", fullName: "unrelated/project" };
    const fields = [kind === "description" ? DESCRIPTION_POLICY_VERSION : CATEGORY_POLICY_VERSION,
      unrelated.fullName.toLowerCase(), unrelated.name, unrelated.type, unrelated.description ?? "",
      unrelated.readmeSummary ?? "", unrelated.topics ?? [], unrelated.install.packageName ?? null,
      unrelated.install.repositoryPath ?? null];
    expect(contentSourceHash(unrelated, kind)).toBe(createHash("sha256").update(JSON.stringify(fields)).digest("hex"));
    expect(contentSourceHash(unrelated, kind)).toBe(contentSourceHash({ ...unrelated,
      install: { ...unrelated.install, discovery: { ...unrelated.install.discovery!, evidence: [] } } }, kind));
    expect(applyFunctionEvidenceCheck(unrelated, undefined, check("not-required"))).toBe(unrelated);
  });
});
