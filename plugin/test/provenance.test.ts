import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertProvenanceLedgerReadable, recordInstallProvenance } from "../src/host/provenance.js";
import type { InstallPreflight } from "../src/shared/types.js";

const directories: string[] = [];

function ledgerFixture() {
  const directory = mkdtempSync(join(tmpdir(), "dsh-top100-provenance-"));
  directories.push(directory);
  const config = { dataUrl: "https://example.invalid", profile: "web", profileDirectory: directory };
  const path = join(directory, ".dsh-top100", "provenance.json");
  return { config, path };
}

function approval(packageName: string, version = "1.0.0"): InstallPreflight {
  return {
    approvalToken: "one-time-token", expiresAt: Date.now() + 60_000, fullName: "acme/monorepo", profile: "web", kind: "bundle",
    lifecycleScripts: [], risks: [], requiresExplicitApproval: false, activationExpectation: "restart-required",
    provenance: {
      source: "npm", requestedTarget: `${packageName}@latest`, resolvedTarget: `${packageName}@${version}`, packageName,
      version, commit: null, integrity: "sha512-test", repositoryUrl: "https://github.com/acme/monorepo",
      repositoryIdentity: "matched", verifiedAt: Date.now(),
    },
  };
}

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
    expect(JSON.parse(raw)).toMatchObject({ schema: "dsh-top100/provenance/v2", records: { "bundle:demo": { fullName: "acme/demo" } } });
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

  it("keeps two packages from one repository and updates only the selected package", () => {
    const { config, path } = ledgerFixture();
    recordInstallProvenance(config, approval("@acme/first"));
    recordInstallProvenance(config, approval("@acme/second"));
    recordInstallProvenance(config, approval("@acme/first", "2.0.0"));
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    expect(Object.keys(ledger.records)).toEqual(["bundle:@acme/first", "bundle:@acme/second"]);
    expect(ledger.records["bundle:@acme/first"].preflight.provenance.version).toBe("2.0.0");
    expect(ledger.records["bundle:@acme/second"].preflight.provenance.version).toBe("1.0.0");
    expect(Object.values(ledger.records).every((record: any) => record.fullName === "acme/monorepo")).toBe(true);
  });

  it("stores each Skill separately from packages in the same repository", () => {
    const { config, path } = ledgerFixture();
    recordInstallProvenance(config, approval("first"));
    const skillApproval = { ...approval("first"), kind: "skill" as const };
    skillApproval.provenance = { ...skillApproval.provenance, packageName: null, source: "github", commit: "a".repeat(40) };
    recordInstallProvenance(config, skillApproval, ["first", "second"].map((name) => ({
      name, commit: "a".repeat(40), digest: `sha256-${name}`, files: ["SKILL.md"], alreadyInstalled: false,
    })));
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    expect(Object.keys(ledger.records)).toEqual(["bundle:first", "skill:first", "skill:second"]);
    expect(ledger.records["skill:first"].skills.map((skill: any) => skill.name)).toEqual(["first"]);
    expect(ledger.records["skill:second"].fullName).toBe("acme/monorepo");
  });

  it("reads a v1 ledger without writing it, then migrates package and Skill identities on the next record", () => {
    const { config, path } = ledgerFixture();
    mkdirSync(join(config.profileDirectory, ".dsh-top100"));
    const { approvalToken: _token, expiresAt: _expiresAt, ...preflight } = approval("@acme/first");
    const source = JSON.stringify({ schema: "dsh-top100/provenance/v1", records: {
      "acme/monorepo": { fullName: "acme/monorepo", profile: "web", installedAt: 1, preflight, skills: [] },
      "acme/skills": { fullName: "acme/skills", profile: "web", installedAt: 2,
        preflight: { ...preflight, kind: "skill", fullName: "acme/skills", provenance: { ...preflight.provenance, packageName: null } },
        skills: [{ name: "research", commit: "a".repeat(40), digest: "sha256-research", files: ["SKILL.md"] }] },
    } });
    writeFileSync(path, source);
    expect(() => assertProvenanceLedgerReadable(config)).not.toThrow();
    expect(readFileSync(path, "utf8")).toBe(source);
    recordInstallProvenance(config, approval("@acme/second"));
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    expect(ledger.schema).toBe("dsh-top100/provenance/v2");
    expect(Object.keys(ledger.records).sort()).toEqual(["bundle:@acme/first", "bundle:@acme/second", "skill:research"]);
    expect(ledger.records["bundle:@acme/first"].installedAt).toBe(1);
    expect(ledger.records["skill:research"].fullName).toBe("acme/skills");
  });

  it("does not discard colliding historical v1 package records during migration", () => {
    const { config, path } = ledgerFixture();
    mkdirSync(join(config.profileDirectory, ".dsh-top100"));
    const { approvalToken: _token, expiresAt: _expiresAt, ...preflight } = approval("shared");
    writeFileSync(path, JSON.stringify({ schema: "dsh-top100/provenance/v1", records: {
      "old/repo": { fullName: "old/repo", profile: "web", installedAt: 1, preflight, skills: [] },
      "new/repo": { fullName: "new/repo", profile: "web", installedAt: 2, preflight, skills: [] },
    } }));
    recordInstallProvenance(config, approval("other"));
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    expect(ledger.records["bundle:shared"].fullName).toBe("new/repo");
    expect(Object.values(ledger.records).some((record: any) => record.fullName === "old/repo")).toBe(true);
    expect(Object.keys(ledger.records)).toHaveLength(3);
  });
});
