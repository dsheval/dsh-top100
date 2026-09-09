import { describe, expect, it } from "vitest";
import { diagnosticLabels, presentDiagnosticBundleError, presentDiagnosticFinding } from "../src/client/diagnostic-presentation.js";
import type { DiagnosticBundle, DiagnosticFinding, DiagnosticReport } from "../src/shared/types.js";

function report(): DiagnosticReport {
  return {
    schema: "dsh-top100/diagnostics/v1", profile: "web", profileDir: "/profiles/web", scannedAt: 0, pluginVersion: "1.3.2",
    summary: { ok: false, errors: 1, warnings: 1, infos: 0, conflicts: 0, dependencies: 0, catalogIssues: 0, order: 0 },
    catalog: { dataUrl: "https://example.test/catalog", ok: true, error: null, snapshotDate: "2026-08-01", generatedAt: null, fetchedAt: 0, latencyMs: 1, counts: { hot: 0, rising: 0, total: 0 }, staleDays: 39 },
    inventory: { official: 0, community: 0, skills: 0, enabled: 0, disabled: 0, protected: 0, local: 0, updates: 0, catalogMatched: 0, missingOnDisk: 0, extraDependencies: [] },
    bundles: [], skills: [], duplicates: [], peers: [], multiVersion: [], hostDeps: [],
    patch: { path: "/profiles/web/cordis.patch.yml", exists: false, disables: [], forced: [], orphans: [] }, findings: [],
  };
}

function finding(code: string, parameters?: DiagnosticFinding["parameters"]): DiagnosticFinding {
  return { code, subject: "demo", severity: "warning", message: "原始中文诊断，不应直接显示在英文摘要中", detail: "raw technical error", ...(parameters ? { parameters } : {}) };
}

describe("diagnostic language presentation", () => {
  it.each([
    "profile-missing", "catalog-unreachable", "catalog-stale", "user-patch-invalid", "bundle-unresolved",
    "bundle-local", "bundle-unlisted", "bundle-disabled", "peer-missing", "peer-mismatch",
    "host-core-dependency", "duplicate-entry", "skill-manifest-missing", "core-multi-version", "patch-orphan", "extra-dependency",
  ])("presents %s in English while retaining raw evidence only in technical details", (code) => {
    const input = finding(code);
    const presented = presentDiagnosticFinding(input, report(), "en");
    expect(presented.message).not.toMatch(/\p{Script=Han}/u);
    expect(presented.message.length).toBeGreaterThan(15);
    expect(presented.technicalDetails).toContain(input.message);
    expect(presented.technicalDetails).toContain(input.detail);
    expect(presentDiagnosticFinding(input, report(), "zh").message).toMatch(/\p{Script=Han}/u);
  });

  it("keeps distinct peers for the same plugin using structured parameters", () => {
    const data = report();
    data.peers = [
      { plugin: "demo", name: "first-peer", range: "^1.0.0", resolved: null, satisfied: null },
      { plugin: "demo", name: "second-peer", range: "^2.0.0", resolved: null, satisfied: null },
    ];
    const first = presentDiagnosticFinding(finding("peer-missing", { dependency: "first-peer", range: "^1.0.0" }), data, "en");
    const second = presentDiagnosticFinding(finding("peer-missing", { dependency: "second-peer", range: "^2.0.0" }), data, "en");
    expect(first.message).toContain("first-peer");
    expect(first.message).toContain("^1.0.0");
    expect(first.message).not.toContain("second-peer");
    expect(second.message).toContain("second-peer");
    expect(second.message).toContain("^2.0.0");
  });

  it("uses structured versions without parsing raw messages", () => {
    const mismatch = finding("peer-mismatch", { dependency: "real-peer", range: "^3.0.0", resolved: "2.9.0" });
    mismatch.message = "fake-peer 声明 ^1.0.0，解析到 1.0.0";
    expect(presentDiagnosticFinding(mismatch, report(), "en").message).toBe("real-peer requires ^3.0.0, but resolves to 2.9.0.");
    expect(presentDiagnosticFinding(finding("catalog-stale", { days: 55 }), report(), "en").message).toContain("55 days");
  });

  it("uses report fields for old reports only when the association is unambiguous", () => {
    const data = report();
    data.peers = [{ plugin: "demo", name: "known-peer", range: "^1.0.0", resolved: "2.0.0", satisfied: false }];
    expect(presentDiagnosticFinding(finding("peer-mismatch"), data, "en").message).toContain("known-peer requires ^1.0.0");
    data.peers.push({ plugin: "demo", name: "second-peer", range: "^4.0.0", resolved: "2.0.0", satisfied: false });
    const ambiguous = presentDiagnosticFinding(finding("peer-mismatch"), data, "en");
    expect(ambiguous.message).not.toContain("known-peer");
    expect(ambiguous.message).not.toContain("second-peer");
    expect(ambiguous.technicalDetails).toContain("原始中文诊断");
    data.duplicates = [{ id: "demo", layers: ["first-bundle", "second-bundle"], count: 2 }];
    data.multiVersion = [{ name: "demo", versions: ["1.0.0", "2.0.0"] }];
    expect(presentDiagnosticFinding(finding("duplicate-entry"), data, "en").message).toContain("first-bundle / second-bundle");
    expect(presentDiagnosticFinding(finding("core-multi-version"), data, "en").message).toContain("1.0.0 / 2.0.0");
  });

  it("uses a translated fallback for future diagnostic codes", () => {
    const presented = presentDiagnosticFinding(finding("future-diagnostic"), report(), "en");
    expect(presented.message).toBe("An additional diagnostic finding was reported. See technical details.");
    expect(presented.technicalDetails).toContain("原始中文诊断");
    expect(diagnosticLabels("en").technicalDetails).toBe("Technical details");
    expect(diagnosticLabels("zh").technicalDetails).toBe("技术详情");
  });
});

describe("bundle error localization", () => {
  const bundle: DiagnosticBundle = {
    name: "demo", spec: "1.0.0", version: "1.0.0", kind: "community", directory: "/plugins/demo", patchPath: null,
    entries: [], error: "原始中文错误", enabled: true, local: false, protected: false, catalogName: null, latest: null, updateAvailable: false,
  };
  it.each(["package-missing", "manifest-unreadable", "not-dsh-bundle", "patch-invalid"] as const)("localizes %s without exposing raw Chinese as its summary", (errorCode) => {
    const presented = presentDiagnosticBundleError({ ...bundle, errorCode }, "en")!;
    expect(presented.message).not.toMatch(/\p{Script=Han}/u);
    expect(presented.technicalDetails).toBe(bundle.error);
  });
  it("does not guess old bundle failure causes from raw text", () => {
    expect(presentDiagnosticBundleError(bundle, "en")?.message).toContain("could not be validated");
    expect(presentDiagnosticBundleError({ ...bundle, directory: null }, "en")?.message).toContain("installation directory");
    expect(presentDiagnosticBundleError({ ...bundle, error: null }, "en")).toBeNull();
  });
});
