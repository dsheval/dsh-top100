import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiagnosticReport } from "../src/host/diagnose.js";
import type { RankingsDocument } from "../src/shared/types.js";

const emptyCatalog: RankingsDocument = {
  schemaVersion: 1,
  generatedAt: "2026-08-25T00:00:00.000Z",
  snapshotDate: "2026-08-25",
  rankings: { hot: [], rising: [], total: [] },
};

const temporaryDirectories: string[] = [];
function temporaryProfile(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-top100-diagnose-"));
  temporaryDirectories.push(directory);
  vi.stubEnv("DSH_HOME", join(directory, "home"));
  return directory;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("profile diagnostics", () => {
  it("only scans bundles declared by the current profile", async () => {
    const directory = temporaryProfile();
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
    }));
    const report = await buildDiagnosticReport("web", { profileDir: directory, document: emptyCatalog });
    expect(report.bundles.map((item) => item.name)).toEqual(["@deepseek-ai/dsh-base"]);
    expect(report.duplicates).toEqual([]);
  });

  it.each([false, true])("distinguishes missing required and optional peer dependencies (optional=%s)", async (optional) => {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "audit-plugin");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: { "audit-plugin": "1.0.0" },
      dsh: { profile: { bundles: ["audit-plugin"] } },
    }));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({
      name: "audit-plugin", version: "1.0.0", dsh: { bundle: { patch: "./cordis.patch.yml" } },
      peerDependencies: { "audit-missing-peer": "^1.0.0" },
      peerDependenciesMeta: { "audit-missing-peer": { optional } },
    }));
    writeFileSync(join(pluginDirectory, "cordis.patch.yml"), "[]\n");
    const report = await buildDiagnosticReport("web", {
      profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt),
    });
    expect(report.summary.ok).toBe(optional);
    expect(report.summary.dependencies).toBe(optional ? 0 : 1);
    expect(report.findings.filter((finding) => finding.code === "peer-missing")).toHaveLength(optional ? 0 : 1);
    expect(report.peers).toContainEqual({
      plugin: "audit-plugin", name: "audit-missing-peer", range: "^1.0.0", resolved: null, satisfied: null,
    });
  });

  it("resolves a required peer from a pnpm plugin's real installation directory", async () => {
    const directory = temporaryProfile();
    const modules = join(directory, "node_modules");
    const virtualModules = join(modules, ".pnpm", "audit-plugin@1.0.0", "node_modules");
    const pluginDirectory = join(virtualModules, "audit-plugin");
    const peerDirectory = join(virtualModules, "audit-required-peer");
    mkdirSync(pluginDirectory, { recursive: true });
    mkdirSync(peerDirectory, { recursive: true });
    symlinkSync(pluginDirectory, join(modules, "audit-plugin"), "junction");
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: { "audit-plugin": "1.0.0" }, dsh: { profile: { bundles: ["audit-plugin"] } },
    }));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({
      name: "audit-plugin", version: "1.0.0", dsh: { bundle: { patch: "./cordis.patch.yml" } },
      peerDependencies: { "audit-required-peer": "^1.0.0" },
    }));
    writeFileSync(join(pluginDirectory, "cordis.patch.yml"), "[]\n");
    writeFileSync(join(peerDirectory, "package.json"), JSON.stringify({ name: "audit-required-peer", version: "1.2.0" }));
    const report = await buildDiagnosticReport("web", {
      profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt),
    });
    expect(report.summary.ok).toBe(true);
    expect(report.summary.dependencies).toBe(0);
    expect(report.peers).toContainEqual({
      plugin: "audit-plugin", name: "audit-required-peer", range: "^1.0.0", resolved: "1.2.0", satisfied: true,
    });
  });
});

describe("structured patch diagnostics", () => {
  it.each(["missing-patch", "malformed-patch", "invalid-structure", "malformed-user-patch"])("reports %s as an error", async (scenario) => {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "demo");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({dependencies: {demo: "1.0.0"}, dsh: {profile: {bundles: ["demo"]}}}));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({name: "demo", version: "1.0.0", dsh: {bundle: {patch: "bundle.yml"}}}));
    // A conventional fallback must not mask a missing declared bundle layer.
    writeFileSync(join(pluginDirectory, "cordis.patch.yml"), "[]\n");
    if (scenario !== "missing-patch") writeFileSync(join(pluginDirectory, "bundle.yml"), scenario === "malformed-patch" ? "[broken" : scenario === "invalid-structure" ? "[null]" : "[]\n");
    if (scenario === "malformed-user-patch") writeFileSync(join(directory, "cordis.patch.yml"), "[broken");
    const report = await buildDiagnosticReport("web", {profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt)});
    expect(report.summary.ok).toBe(false);
    expect(report.findings.some((finding) => finding.severity === "error" && finding.code === (scenario === "malformed-user-patch" ? "user-patch-invalid" : "bundle-unresolved"))).toBe(true);
  });

  it("uses flow/alias loader ids and flow disabled overrides consistently", async () => {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "demo");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({dependencies: {demo: "1.0.0"}, dsh: {profile: {bundles: ["demo"]}}}));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({name: "demo", version: "1.0.0", dsh: {bundle: {patch: "bundle.yml"}}}));
    writeFileSync(join(pluginDirectory, "bundle.yml"), '[{insert: [{id: actual-loader, name: demo, config: {id: ordinary-option, value: !!js "env.X"}}]}]');
    writeFileSync(join(directory, "cordis.patch.yml"), '[{id: actual-loader, config: {nested: true}, disabled: true}]');
    const report = await buildDiagnosticReport("web", {profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt)});
    expect(report.summary.ok).toBe(true);
    expect(report.bundles[0]).toMatchObject({entries: ["actual-loader"], enabled: false, error: null});
    expect(report.patch.orphans).toEqual([]);
  });
});


it.each([
  {user: '- id: active\n  name: wrong-module\n  disabled: true\n', enabled:true, disables:[]},
  {user: '- id: active\n  name: demo\n  disabled: true\n', enabled:false, disables:['active']},
  {user: '- id: active\n  name: demo\n  disabled: true\n- id: active\n  name: wrong-module\n  disabled: false\n', enabled:false, disables:['active']},
])('diagnostics follow actual name guards: $enabled / $user', async ({user,enabled,disables}) => {
  const directory = temporaryProfile();
  const pluginDirectory = join(directory,'node_modules/demo'); mkdirSync(pluginDirectory,{recursive:true});
  writeFileSync(join(directory,'package.json'), JSON.stringify({dependencies:{demo:'1.0.0'},dsh:{profile:{bundles:['demo']}}}));
  writeFileSync(join(pluginDirectory,'package.json'), JSON.stringify({name:'demo',version:'1.0.0',dsh:{bundle:{patch:'bundle.yml'}}}));
  writeFileSync(join(pluginDirectory,'bundle.yml'), '- insert: [{id: active, name: demo}, {id: optional, name: demo/optional, disabled: true}]\n');
  writeFileSync(join(directory,'cordis.patch.yml'),user);
  const report = await buildDiagnosticReport('web',{profileDir:directory,document:emptyCatalog,now:Date.parse(emptyCatalog.generatedAt)});
  expect(report.bundles[0].enabled).toBe(enabled);
  expect(report.patch.disables).toEqual(disables);
});
