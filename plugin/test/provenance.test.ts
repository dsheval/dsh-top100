import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { recordInstallProvenance } from "../src/host/provenance.js";
import type { InstallPreflight } from "../src/shared/types.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("install provenance ledger", () => {
  it("persists immutable source evidence without persisting the approval token", () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-provenance-"));
    directories.push(directory);
    const preflight: InstallPreflight = {
      approvalToken: "secret-one-time-token",
      expiresAt: Date.now() + 10_000,
      fullName: "acme/demo",
      profile: "web",
      kind: "bundle",
      lifecycleScripts: [],
      risks: [],
      requiresExplicitApproval: false,
      activationExpectation: "restart-required",
      provenance: {
        source: "npm",
        requestedTarget: "demo@latest",
        resolvedTarget: "demo@1.2.3",
        packageName: "demo",
        version: "1.2.3",
        commit: null,
        integrity: "sha512-demo",
        repositoryUrl: "https://github.com/acme/demo",
        repositoryIdentity: "matched",
        verifiedAt: Date.now(),
      },
    };
    recordInstallProvenance({ dataUrl: "https://example.invalid", profile: "web", profileDirectory: directory }, preflight);
    const raw = readFileSync(join(directory, ".dsh-top100", "provenance.json"), "utf8");
    expect(raw).toContain("demo@1.2.3");
    expect(raw).toContain("sha512-demo");
    expect(raw).not.toContain("secret-one-time-token");
  });

  it("does not overwrite an unreadable existing ledger", () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-provenance-invalid-"));
    directories.push(directory);
    const path = join(directory, ".dsh-top100", "provenance.json");
    mkdirSync(join(directory, ".dsh-top100"));
    writeFileSync(path, "not-json\n");
    const preflight: InstallPreflight = {
      approvalToken: "one-time",
      expiresAt: Date.now() + 10_000,
      fullName: "acme/demo",
      profile: "web",
      kind: "bundle",
      lifecycleScripts: [], risks: [], requiresExplicitApproval: false,
      activationExpectation: "restart-required",
      provenance: {
        source: "npm", requestedTarget: "demo", resolvedTarget: "demo@1.0.0", packageName: "demo",
        version: "1.0.0", commit: null, integrity: "sha512-demo", repositoryUrl: null,
        repositoryIdentity: "unavailable", verifiedAt: Date.now(),
      },
    };
    expect(() => recordInstallProvenance(
      { dataUrl: "https://example.invalid", profile: "web", profileDirectory: directory },
      preflight,
    )).toThrow("无法安全读取已有安装来源台账");
    expect(readFileSync(path, "utf8")).toBe("not-json\n");
  });
});
