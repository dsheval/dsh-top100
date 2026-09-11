import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import reviews from "../../plugin/src/shared/reviewed-descriptions.json";
import { reviewedReadmeSource, summarizeSelectedReadme } from "../src/reviewed-summary.js";
import { summarizeReadme, summarizeReviewedReadme } from "../src/summary.js";
import { contentSourceHash, DESCRIPTION_POLICY_VERSION } from "../src/content-source.js";
import { CATEGORY_POLICY_VERSION } from "../src/categories.js";

type Review = { sourceReadme: string; sourceReadmeNormalization?: string;
  sourceInstall?: { packageName: string | null; repositoryPath: string | null } };
const entries = Object.entries(reviews as Record<string, Review>);
const scoped = entries.filter(([, review]) => review.sourceReadmeNormalization === "language-navigation-v1");
const prose = "This package organizes reviewed documents and references for a research workflow. ".repeat(10);
const withNavigation = `中文 | English\n\n${prose}`;

describe("reviewed README normalization scope", () => {
  it("opts in only the current 21 reviewed identities", () => {
    expect(scoped).toHaveLength(21);
    for (const [fullName, review] of entries.filter(([, value]) => value.sourceReadmeNormalization !== "language-navigation-v1")) {
      expect(reviewedReadmeSource(fullName, review.sourceInstall ?? {})).toBeNull();
    }
  });

  it.each(scoped)("normalizes %s only for its exact package and path", (fullName, review) => {
    const identity = review.sourceInstall!;
    expect(reviewedReadmeSource(fullName.toUpperCase(), identity)?.sourceReadme).toBe(review.sourceReadme);
    expect(summarizeSelectedReadme(fullName, identity, withNavigation)).toBe(summarizeReviewedReadme(prose));
    expect(summarizeSelectedReadme(fullName, identity, withNavigation)).toBe(summarizeSelectedReadme(fullName, identity, prose));
    for (const wrong of [{ ...identity, packageName: "unreviewed-package" }, { ...identity, repositoryPath: "different/path" }, {}]) {
      expect(reviewedReadmeSource(fullName, wrong)).toBeNull();
      expect(summarizeSelectedReadme(fullName, wrong, withNavigation)).toBe(summarizeReadme(withNavigation));
    }
  });

  it("normalizes navigation before truncation without removing functional changes", () => {
    const [fullName, review] = scoped[0];
    const identity = review.sourceInstall!;
    expect(summarizeReadme(withNavigation)).not.toBe(summarizeReadme(prose));
    expect(summarizeSelectedReadme(fullName, identity, `English | 中文\n${prose}`)).toBe(summarizeSelectedReadme(fullName, identity, prose));
    expect(summarizeSelectedReadme(fullName, identity, `中文 | English\nThis package no longer supports research. ${prose}`))
      .not.toBe(summarizeSelectedReadme(fullName, identity, prose));
    expect(summarizeSelectedReadme(fullName, identity, "This text contains 中文 | English inside a sentence."))
      .toContain("中文 | English");
  });

  it.each(["description", "categories"] as const)("preserves the unscoped legacy %s source hash", kind => {
    const identity = scoped[0][1].sourceInstall!;
    const fullName = "unreviewed/repository";
    const readmeSummary = summarizeSelectedReadme(fullName, identity, withNavigation);
    expect(readmeSummary).toBe(summarizeReadme(withNavigation));
    const source = { fullName, name: "repository", type: "cordis-plugin", description: "A review fixture.",
      readmeSummary, topics: ["research"], install: identity };
    const fields = [kind === "description" ? DESCRIPTION_POLICY_VERSION : CATEGORY_POLICY_VERSION,
      fullName, source.name, source.type, source.description, readmeSummary, source.topics,
      identity.packageName, identity.repositoryPath];
    expect(contentSourceHash(source, kind)).toBe(createHash("sha256").update(JSON.stringify(fields)).digest("hex"));
  });
});
