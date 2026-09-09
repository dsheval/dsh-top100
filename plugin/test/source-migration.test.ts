import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, dump } from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applySourceMigration, preflightSourceMigration } from "../src/host/source-migration.js";
import { readBundleProvenance } from "../src/host/provenance.js";
import { resolveUpdateSource } from "../src/host/update-source.js";

vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), writeFileSync: vi.fn(actual.writeFileSync) };
});
const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.mocked(renameSync).mockReset(); vi.mocked(writeFileSync).mockReset(); vi.useRealTimers(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "top100-source-migration-")); directories.push(parent);
  const dir = join(parent, "profile"); mkdirSync(dir);
  const manifestPath = join(dir, "package.json"); const lockPath = join(dir, "pnpm-lock.yaml");
  const manifest = { name: "isolated", dependencies: { demo: "beta", stable: "^1.0.0" }, dsh: { profile: { bundles: ["demo", "stable"] } } };
  const lock = { lockfileVersion: "9.0", settings: { autoInstallPeers: false }, importers: { ".": { dependencies: {
    demo: { specifier: "beta", version: "2.1.0-beta.1" }, stable: { specifier: "^1.0.0", version: "1.0.0" },
  } } }, packages: { "demo@2.1.0-beta.1": { resolution: { integrity: "sha512-demo" } }, "stable@1.0.0": { resolution: { integrity: "sha512-stable" } } }, snapshots: { "demo@2.1.0-beta.1": {}, "stable@1.0.0": {} } };
  writeFileSync(manifestPath, JSON.stringify(manifest)); writeFileSync(lockPath, dump(lock));
  mkdirSync(join(dir, "node_modules", "demo"), { recursive: true });
  const installedPath = join(dir, "node_modules", "demo", "package.json");
  writeFileSync(installedPath, JSON.stringify({ name: "demo", version: "2.1.0-beta.1" }));
  return { parent, dir, manifestPath, lockPath, installedPath, manifest, lock };
}

describe("explicit legacy npm channel migration", () => {
  it("is read-only until approval, then changes only source specifiers and records honest local evidence", () => {
    const f = fixture();
    chmodSync(f.manifestPath, 0o640); chmodSync(f.lockPath, 0o600);
    writeFileSync(join(f.dir, "pnpm-workspace.yaml"), "packages: ['.']\nnodeLinker: hoisted\nautoInstallPeers: false\n");
    const beforeManifest = readFileSync(f.manifestPath); const beforeLock = readFileSync(f.lockPath);
    const preflight = preflightSourceMigration("web", f.dir);
    expect(preflight.items).toEqual([{ name: "demo", from: "beta", version: "2.1.0-beta.1" }]);
    expect(readFileSync(f.manifestPath)).toEqual(beforeManifest); expect(readFileSync(f.lockPath)).toEqual(beforeLock);
    expect(existsSync(join(f.dir, ".dsh-top100"))).toBe(false);
    expect(applySourceMigration(preflight.approvalToken, "web", f.dir)).toEqual({ migrated: 1, items: preflight.items });
    const expectedManifest = structuredClone(f.manifest); expectedManifest.dependencies.demo = "2.1.0-beta.1";
    const expectedLock = structuredClone(f.lock); expectedLock.importers["."].dependencies.demo.specifier = "2.1.0-beta.1";
    expect(JSON.parse(readFileSync(f.manifestPath, "utf8"))).toEqual(expectedManifest);
    expect(load(readFileSync(f.lockPath, "utf8"))).toEqual(expectedLock);
    expect(statSync(f.manifestPath).mode & 0o777).toBe(0o640); expect(statSync(f.lockPath).mode & 0o777).toBe(0o600);
    const provenance = readBundleProvenance("demo", "web", f.dir);
    expect(provenance).toMatchObject({ requestedTarget: "demo@beta", resolvedTarget: "demo@2.1.0-beta.1", integrity: "sha512-demo", repositoryIdentity: "unavailable", verification: "local-existing-install" });
    expect(resolveUpdateSource("demo", "2.1.0-beta.1", { version: "2.1.0-beta.1", provenance })?.target).toBe("demo@beta");
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("已过期");
  });

  it.each(["manifest", "lock", "installed", "new-workspace", "new-ledger"])("rejects changes made after the review: %s", (change) => {
    const f = fixture(); const preflight = preflightSourceMigration("web", f.dir);
    const path = change === "manifest" ? f.manifestPath : change === "lock" ? f.lockPath : change === "installed" ? f.installedPath : change === "new-workspace" ? join(f.parent, "pnpm-workspace.yaml") : join(f.dir, ".dsh-top100", "provenance.json");
    if (change === "new-ledger") mkdirSync(join(f.dir, ".dsh-top100"));
    writeFileSync(path, "external change");
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("发生变化");
    expect(readFileSync(path, "utf8")).toBe("external change");
  });

  it.each(["missing-lock", "wrong-version", "wrong-specifier", "multi-importer", "corrupt-ledger", "dev-tag", "optional-tag", "dangling-ledger"])("refuses unsupported or inconsistent state: %s", (change) => {
    const f = fixture();
    if (change === "missing-lock") rmSync(f.lockPath);
    if (change === "wrong-version") { f.lock.importers["."].dependencies.demo.version = "2.1.0-beta.2"; writeFileSync(f.lockPath, dump(f.lock)); }
    if (change === "wrong-specifier") { f.lock.importers["."].dependencies.demo.specifier = "next"; writeFileSync(f.lockPath, dump(f.lock)); }
    if (change === "multi-importer") { writeFileSync(f.lockPath, dump({ ...f.lock, importers: { ...f.lock.importers, other: {} } })); }
    if (change === "corrupt-ledger" || change === "dangling-ledger") {
      mkdirSync(join(f.dir, ".dsh-top100"));
      if (change === "corrupt-ledger") writeFileSync(join(f.dir, ".dsh-top100", "provenance.json"), "invalid JSON");
      else symlinkSync(join(f.dir, "missing-ledger"), join(f.dir, ".dsh-top100", "provenance.json"));
    }
    if (change === "dev-tag" || change === "optional-tag") writeFileSync(f.manifestPath, JSON.stringify({ ...f.manifest, [change === "dev-tag" ? "devDependencies" : "optionalDependencies"]: { other: "beta" } }));
    expect(() => preflightSourceMigration("web", f.dir)).toThrow();
  });

  it("restores original bytes and permissions after a failed second file replacement", async () => {
    const f = fixture(); chmodSync(f.manifestPath, 0o640); chmodSync(f.lockPath, 0o600);
    const manifest = readFileSync(f.manifestPath); const lock = readFileSync(f.lockPath);
    const preflight = preflightSourceMigration("web", f.dir);
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(from).endsWith(".tmp") && String(to).endsWith("/pnpm-lock.yaml")) throw new Error("simulated rename failure");
      actual.renameSync(from, to);
    });
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("已恢复原文件");
    expect(readFileSync(f.manifestPath)).toEqual(manifest); expect(readFileSync(f.lockPath)).toEqual(lock);
    expect(statSync(f.manifestPath).mode & 0o777).toBe(0o640); expect(statSync(f.lockPath).mode & 0o777).toBe(0o600);
    expect(existsSync(join(f.dir, ".dsh-top100"))).toBe(false);
    expect(readdirSync(f.dir).some((name) => name.endsWith(".tmp") || name.endsWith(".bak"))).toBe(false);
  });

  it("keeps external writes and the original backup when rollback would overwrite another change", async () => {
    const f = fixture(); const preflight = preflightSourceMigration("web", f.dir);
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(from).endsWith(".tmp") && String(to).endsWith("/pnpm-lock.yaml")) { actual.writeFileSync(f.manifestPath, "external editor"); throw new Error("simulated failure"); }
      actual.renameSync(from, to);
    });
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("自动恢复未完成");
    expect(readFileSync(f.manifestPath, "utf8")).toBe("external editor");
    expect(readdirSync(f.dir).some((name) => name.startsWith("package.json.") && name.endsWith(".bak"))).toBe(true);
  });

  it("leaves all original files untouched if preparing the ledger file fails", async () => {
    const f = fixture(); const manifest = readFileSync(f.manifestPath); const lock = readFileSync(f.lockPath);
    const preflight = preflightSourceMigration("web", f.dir);
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(writeFileSync).mockImplementation((...args) => {
      if (String(args[0]).includes("provenance.json.") && String(args[0]).endsWith(".tmp")) throw new Error("simulated disk full");
      actual.writeFileSync(...args);
    });
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("已恢复原文件");
    expect(readFileSync(f.manifestPath)).toEqual(manifest); expect(readFileSync(f.lockPath)).toEqual(lock);
    expect(existsSync(join(f.dir, ".dsh-top100"))).toBe(false);
  });

  it("does not undo a concurrent permission change while recovering a later write failure", async () => {
    const f = fixture(); chmodSync(f.manifestPath, 0o640); const preflight = preflightSourceMigration("web", f.dir);
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(from).endsWith(".tmp") && String(to).endsWith("/pnpm-lock.yaml")) {
        actual.chmodSync(f.manifestPath, 0o600); throw new Error("simulated failure");
      }
      actual.renameSync(from, to);
    });
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("自动恢复未完成");
    expect(statSync(f.manifestPath).mode & 0o777).toBe(0o600);
    expect(readdirSync(f.dir).some((name) => name.startsWith("package.json.") && name.endsWith(".bak"))).toBe(true);
  });

  it("binds approvals to the profile and expires them", () => {
    vi.useFakeTimers(); const f = fixture(); const preflight = preflightSourceMigration("web", f.dir);
    expect(() => applySourceMigration(preflight.approvalToken, "other", f.dir)).toThrow("Profile 不匹配");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(() => applySourceMigration(preflight.approvalToken, "web", f.dir)).toThrow("已过期");
  });
});
