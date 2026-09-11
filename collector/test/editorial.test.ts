import { describe, expect, it } from "vitest";
import descriptions from "../../plugin/src/shared/reviewed-descriptions.json";
import categories from "../config/reviewed-categories.json";
import { reviewedCategories, reviewedDescription } from "../src/editorial.js";
import { CATEGORY_POLICY_VERSION, categorySourceHash, currentCategoryAssignments } from "../src/categories.js";
import { hasChineseDescription } from "../src/description-jobs.js";

function source(fullName: keyof typeof categories) {
  const review = categories[fullName];
  return { name: fullName.split("/")[1], fullName,
    type: review.sourceType,
    install: { packageName: review.sourceInstall.packageName ?? undefined, repositoryPath: review.sourceInstall.repositoryPath ?? undefined,
      ...("functionEvidence" in review.sourceInstall ? { discovery: { status: "verified" as const, kind: "bundle" as const,
        checkedAt: "2026-09-11T00:00:00Z", policyVersion: 6, sourceRevision: "fixture",
        evidence: [`reviewed-function-sha256:${review.sourceInstall.functionEvidence}`] } } : {}) },
    description: review.sourceDescription, readmeSummary: review.sourceReadme, topics: [] as string[] };
}

describe("current priority editorial review", () => {
  it("rebinds a fixed category after language-navigation changes without relaxing identity or body checks", () => {
    const entry = source("nexu-io/open-design");
    const original = reviewedCategories(entry)!;
    const changed = { ...entry, readmeSummary: `中文 | English ${entry.readmeSummary}` };
    const rebound = reviewedCategories(changed)!;
    expect(rebound.map(category => category.id)).toEqual(original.map(category => category.id));
    expect(rebound[0].sourceHash).toBe(categorySourceHash(changed));
    expect(rebound[0].sourceHash).not.toBe(original[0].sourceHash);
    expect(reviewedCategories({ ...changed, readmeSummary: `${changed.readmeSummary} New behavior.` })).toBeNull();
    expect(reviewedCategories({ ...changed, install: { ...entry.install, packageName: "different" } })).toBeNull();
  });

  it("covers 174 priority and 84 high-star reviews with Chinese descriptions and matching source evidence", () => {
    const priorityReview = (review: (typeof categories)[keyof typeof categories]) => !("reviewScope" in review) || review.reviewScope === "production-package-followup";
    const baseline = Object.entries(categories).filter(([, review]) => priorityReview(review) || ("reviewScope" in review && review.reviewScope === "highstar-longtail"));
    expect(baseline).toHaveLength(258);
    expect(baseline.filter(([, review]) => priorityReview(review))).toHaveLength(174);
    expect(baseline.filter(([, review]) => "reviewScope" in review && review.reviewScope === "highstar-longtail")).toHaveLength(84);
    for (const [fullName, review] of baseline) {
      const entry = source(fullName as keyof typeof categories);
      const description = descriptions[fullName as keyof typeof descriptions];
      expect(fullName).toBe(fullName.toLowerCase());
      expect(description, fullName).toBeDefined();
      expect(description.sourceDescription, fullName).toBe(review.sourceDescription);
      expect(description.sourceReadme, fullName).toBe(review.sourceReadme);
      expect(description.sourceUrl, fullName).toBe(review.sourceUrl);
      expect(description.reviewedAt, fullName).toBe(review.reviewedAt);
      expect(description, fullName).not.toHaveProperty("snapshotId");
      const chinese = reviewedDescription(entry);
      expect(chinese, fullName).toBe(description.descriptionZh);
      if ("suspended" in description && description.suspended) {
        expect(chinese).toBe("中文简介待生成。");
        expect(hasChineseDescription(chinese)).toBe(false);
        expect(reviewedCategories(entry)).toEqual([]);
        continue;
      }
      expect(hasChineseDescription(chinese), fullName).toBe(true);
      const chineseLength = (chinese!.match(/[\u3400-\u9fff]/g) || []).length;
      // Preserve already accurate shorter descriptions in the long-tail batch.
      expect(chineseLength, fullName).toBeGreaterThanOrEqual("reviewScope" in review ? 6 : 30);
      expect(chineseLength, fullName).toBeLessThanOrEqual(60);
      expect(chinese, fullName).not.toMatch(/资料不足|简介待生成|求\s*Star|<|>/i);
      expect(reviewedDescription({ ...entry, fullName: fullName.toUpperCase() }), fullName).toBe(chinese);
    }
  });

  it("rejects both manual fields when package, subdirectory, or entry type changes", () => {
    for (const fullName of Object.keys(categories)) {
      const entry = source(fullName as keyof typeof categories);
      for (const changed of [
        { ...entry, install: { ...entry.install, packageName: "fixture/changed-package" } },
        { ...entry, install: { ...entry.install, repositoryPath: "packages/changed-path" } },
        { ...entry, type: entry.type === "skill" ? "cordis-plugin" : "skill" },
        { ...entry, type: undefined },
      ]) {
        const guarded = "functionEvidence" in categories[fullName as keyof typeof categories].sourceInstall;
        expect(reviewedDescription(changed), fullName).toBe(guarded ? "中文简介待生成。" : null);
        expect(reviewedCategories(changed), fullName).toEqual(guarded ? [] : null);
      }
    }
  });

  it("does not guess package identities for unbound legacy descriptions", () => {
    const legacy = Object.entries(descriptions).find(([, review]) => !("sourceInstall" in review));
    expect(legacy).toBeDefined();
    const [fullName, review] = legacy!;
    const entry = { name: fullName.split("/")[1], fullName, description: review.sourceDescription, readmeSummary: review.sourceReadme };
    expect(reviewedDescription(entry)).toBe(review.descriptionZh);
    expect(reviewedDescription({ ...entry, install: { packageName: "new-package" } })).toBeNull();
    expect(reviewedDescription({ ...entry, install: { repositoryPath: "packages/new" } })).toBeNull();
  });

  it("binds every manual category to the reviewed input and current policy", () => {
    for (const [fullName, review] of Object.entries(categories)) {
      const entry = source(fullName as keyof typeof categories);
      const assignments = reviewedCategories(entry);
      expect(assignments, fullName).toHaveLength(review.categories.length);
      const description = descriptions[fullName as keyof typeof descriptions];
      if (description && "suspended" in description && description.suspended) expect(assignments, fullName).toEqual([]);
      else expect(assignments!.length, fullName).toBeGreaterThan(0);
      expect(assignments!.length, fullName).toBeLessThanOrEqual(3);
      for (const [index, assignment] of assignments!.entries()) {
        expect(assignment, fullName).toMatchObject({
          ...review.categories[index], source: "manual",
          sourceHash: categorySourceHash(entry), policyVersion: CATEGORY_POLICY_VERSION,
        });
        expect(assignment.evidence.trim().length, fullName).toBeGreaterThan(0);
      }
      expect(currentCategoryAssignments(entry, assignments), fullName).toEqual(assignments);
      expect(currentCategoryAssignments({ ...entry, topics: ["new-topic"] }, assignments), fullName).toEqual([]);
    }
  });

  it("invalidates both descriptions and categories when either author source changes or disappears", () => {
    for (const fullName of Object.keys(categories)) {
      const entry = source(fullName as keyof typeof categories);
      for (const changed of [
        { ...entry, description: `${entry.description} Changed project purpose.` },
        { ...entry, readmeSummary: `${entry.readmeSummary} Changed behavior.` },
        ...(entry.readmeSummary ? [{ ...entry, readmeSummary: undefined }] : []),
      ]) {
        expect(reviewedDescription(changed), fullName).toBeNull();
        expect(reviewedCategories(changed), fullName).toBeNull();
        expect(currentCategoryAssignments(changed, reviewedCategories(entry)), fullName).toEqual([]);
      }
    }
    const unknown = { name: "unreviewed", fullName: "fixture/unreviewed", description: "New tool", readmeSummary: "New README" };
    expect(reviewedDescription(unknown)).toBeNull();
    expect(reviewedCategories(unknown)).toBeNull();
  });
});
