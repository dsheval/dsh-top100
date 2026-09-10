import { describe, expect, it } from "vitest";
import type { DshPlugin } from "@dsh-top100/schema";
import { canRestorePrevious, canReuseDetectionCache, restoredDiscovery } from "../src/discovery-policy.js";
import { DISCOVERY_POLICY_VERSION } from "../src/detect.js";
import { SOURCE_DOCUMENT_CACHE_VERSION } from "../src/selected-readme.js";

const previous = {
  type: "cordis-plugin", pushedAt: "2026-09-01T00:00:00Z", lastCheckedAt: "2026-09-02T00:00:00Z", install: {},
} as DshPlugin;

describe("discovery recovery policy", () => {
  it("never restores a definitive rejection and permits unresolved or unscanned records", () => {
    const rejected = new Set(["acme/app"]);
    expect(canRestorePrevious("ACME/App", rejected)).toBe(false);
    expect(canRestorePrevious("acme/plugin", rejected)).toBe(true);
  });

  it("invalidates old detection policy caches even when the repository is unchanged", () => {
    const cache = { schemaVersion: 3, checkedAt: previous.lastCheckedAt, pushedAt: previous.pushedAt, installParserVersion: 2,
      sourceDocumentVersion: SOURCE_DOCUMENT_CACHE_VERSION };
    expect(canReuseDetectionCache(cache, previous.pushedAt, 2)).toBe(false);
    cache.schemaVersion = DISCOVERY_POLICY_VERSION;
    expect(canReuseDetectionCache(cache, previous.pushedAt, 2)).toBe(true);
    expect(canReuseDetectionCache(cache, "new-push", 2)).toBe(false);
    expect(canReuseDetectionCache(cache, previous.pushedAt, 3)).toBe(false);
    expect(canReuseDetectionCache({ ...cache, checkedAt: undefined }, previous.pushedAt, 2)).toBe(false);
    expect(canReuseDetectionCache({ ...cache, sourceDocumentVersion: undefined }, previous.pushedAt, 2)).toBe(false);
    expect(canReuseDetectionCache({ ...cache, sourceDocumentVersion: SOURCE_DOCUMENT_CACHE_VERSION - 1 }, previous.pushedAt, 2)).toBe(false);
  });

  it("preserves old check time and revision, marks restored legacy records for review", () => {
    expect(restoredDiscovery(previous)).toMatchObject({
      status: "review-required", checkedAt: previous.lastCheckedAt, sourceRevision: previous.pushedAt, policyVersion: 0,
    });
  });

  it("retains evidence of the actual verified revision even if metadata changed", () => {
    const withEvidence = {
      ...previous, pushedAt: "2026-09-09T00:00:00Z",
      install: { ...previous.install, discovery: {
        status: "verified" as const, kind: "bundle" as const, evidence: ["declared patch"],
        checkedAt: "2026-09-03T00:00:00Z", sourceRevision: "2026-09-01T00:00:00Z", policyVersion: DISCOVERY_POLICY_VERSION,
      } },
    };
    const restored = restoredDiscovery(withEvidence);
    expect(restored).toMatchObject({ status: "review-required", kind: "bundle", sourceRevision: "2026-09-01T00:00:00Z", checkedAt: "2026-09-03T00:00:00Z" });
    expect(restoredDiscovery({ ...withEvidence, install: { ...withEvidence.install, discovery: restored } }).evidence).toEqual(restored.evidence);
  });
});
