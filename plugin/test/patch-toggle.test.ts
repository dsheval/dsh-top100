import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDshPatches, disabledRowIds, readDshPatch } from "../src/host/dsh-patch.js";
import { packageIsDisabled, parseInsertedIds, setPackageEnabled, userPatchPackageReferences, parseDshPatchText, readUserPatchState, removeRowBlocks, rowIdsForPackage, setRowDisabled } from "../src/host/patch-toggle.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

const temporaryProfiles: string[] = [];
function temporaryProfile(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryProfiles.push(directory);
  return directory;
}
afterEach(() => { vi.restoreAllMocks(); for (const directory of temporaryProfiles.splice(0)) rmSync(directory, {recursive: true, force: true}); });

describe("profile plugin toggle", () => {
  it("finds ids inserted by a bundle patch", () => {
    expect(parseInsertedIds("- insert:\n    - id: demo\n      name: demo\n- id: ignored\n")).toEqual(["demo"]);
  });

  it("writes and removes a user disable without changing the bundle", () => {
    const profile = temporaryProfile("dsh-top100-toggle-");
    const packageDir = join(profile, "node_modules", "sample-plugin");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ dsh: { bundle: { patch: "cordis.patch.yml" } } }));
    writeFileSync(join(packageDir, "cordis.patch.yml"), "- insert:\n    - id: sample-row\n      name: sample\n");
    writeFileSync(join(profile, "cordis.patch.yml"), "[]\n");

    expect(setPackageEnabled("web", "sample-plugin", false, profile).ok).toBe(true);
    expect(packageIsDisabled("web", "sample-plugin", profile)).toBe(true);
    expect(readFileSync(join(packageDir, "cordis.patch.yml"), "utf8")).toContain("sample-row");

    expect(setPackageEnabled("web", "sample-plugin", true, profile).ok).toBe(true);
    expect(packageIsDisabled("web", "sample-plugin", profile)).toBe(false);
  });

  it("finds user-owned insert references and ignores disable rows", () => {
    const profile = temporaryProfile("dsh-top100-patch-ref-");
    const patch = join(profile, "cordis.patch.yml");
    writeFileSync(patch, "- id: demo\n  disabled: true\n- insert:\n    - id: custom\n      name: '@acme/demo/subpath'\n");
    expect(userPatchPackageReferences(patch, "@acme/demo")).toEqual(["@acme/demo/subpath"]);
    expect(userPatchPackageReferences(patch, "unrelated")).toEqual([]);
  });

  it("parses flow-style inserts with the same YAML dialect as DSH", () => {
    const profile = temporaryProfile("dsh-top100-patch-flow-");
    const patch = join(profile, "cordis.patch.yml");
    writeFileSync(patch, "[{ insert: [{ id: demo, name: demo }] }]\n");
    expect(userPatchPackageReferences(patch, "demo")).toEqual(["demo"]);
  });

  it("does not confuse a plugin option named `name` with a loader reference", () => {
    const profile = temporaryProfile("dsh-top100-patch-config-");
    const patch = join(profile, "cordis.patch.yml");
    writeFileSync(patch, "- insert:\n    - id: owner\n      name: owner-plugin\n      config:\n        items:\n          - name: demo\n");
    expect(userPatchPackageReferences(patch, "demo")).toEqual([]);
  });
});

describe("structured DSH patch editing", () => {
  it("extracts only actual loaders from flow, aliases and nested groups", () => {
    const source = `- insert:
    - &loader { id: actual-loader, name: demo, config: { id: not-a-loader, name: option } }
    - { id: group, group: true, config: [ { id: nested, name: nested-plugin } ] }
- insert: [*loader]
`;
    expect(parseInsertedIds(source)).toEqual(["actual-loader", "group", "nested"]);
  });

  it("toggles all flow loader ids while preserving config, aliases and !!js scalars", () => {
    const profile = temporaryProfile("dsh-top100-structured-toggle-");
    const packageDir = join(profile, "node_modules", "demo");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ dsh: { bundle: { patch: "bundle.yml" } } }));
    writeFileSync(join(packageDir, "bundle.yml"), "[{insert: [{id: first, name: demo}, {id: second, name: demo/sub}]}]\n");
    const path = join(profile, "cordis.patch.yml");
    writeFileSync(path, `- id: first
  config: &config { value: !!js 'process.env.TEST', literal: { __jsExpr: 'ordinary data' } }
  disabled: !!js 'ctx.disabled'
- id: untouched
  config: *config
`);
    const before = parseDshPatchText(readFileSync(path, "utf8"))!;
    expect(setPackageEnabled("web", "demo", false, profile)).toMatchObject({ ok: true, rows: ["first", "second"] });
    let after = parseDshPatchText(readFileSync(path, "utf8"))!;
    expect(after.slice(0, 2)).toEqual(before);
    expect(packageIsDisabled("web", "demo", profile)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("!!js");
    expect(setPackageEnabled("web", "demo", true, profile).ok).toBe(true);
    expect(readUserPatchState(path).forced).toEqual([]);
    after = parseDshPatchText(readFileSync(path, "utf8"))!;
    expect(after.slice(0, 2)).toEqual(before);
    expect(after).toEqual(before);
    removeRowBlocks(path, ["first", "second"]);
    expect(parseDshPatchText(readFileSync(path, "utf8"))).toEqual(before);
  });

  it("keeps other fields when uninstall removes boolean overrides", () => {
    const profile = temporaryProfile("dsh-top100-cleanup-");
    const path = join(profile, "cordis.patch.yml");
    writeFileSync(path, '[{id: first, disabled: true, config: {token: !!js "env.TOKEN"}}, {id: second, disabled: false}, {id: other, disabled: true}]');
    const before = parseDshPatchText(readFileSync(path, "utf8"))!;
    removeRowBlocks(path, ["first", "second"]);
    expect(parseDshPatchText(readFileSync(path, "utf8"))).toEqual([{id: "first", config: before[0].config}, before[2]]);
  });

  it.each(["[broken", "[null]", "[{insert: {id: not-a-list}}]", "- &cycle {id: x, config: *cycle}"])("refuses bad patches without changing any bytes: %s", (source) => {
    const profile = temporaryProfile("dsh-top100-bad-patch-");
    const path = join(profile, "cordis.patch.yml");
    writeFileSync(path, source);
    expect(setRowDisabled(path, "demo", true).ok).toBe(false);
    expect(() => removeRowBlocks(path, ["demo"])).toThrow();
    expect(readFileSync(path, "utf8")).toBe(source);
  });

  it("does not guess an id or use fallback patch when the declared layer is broken", () => {
    const profile = temporaryProfile("dsh-top100-no-guess-");
    const packageDir = join(profile, "node_modules", "demo");
    mkdirSync(packageDir, {recursive: true});
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({dsh: {bundle: {patch: "missing.yml"}}}));
    writeFileSync(join(packageDir, "cordis.patch.yml"), "[{insert: [{id: fallback, name: demo}]}]");
    expect(setPackageEnabled("web", "demo", false, profile).ok).toBe(false);
    expect(() => rowIdsForPackage("web", "demo", profile)).toThrow();
    writeFileSync(join(packageDir, "missing.yml"), "[{insert: [{name: demo}]}]");
    expect(rowIdsForPackage("web", "demo", profile)).toEqual([]);
    expect(setPackageEnabled("web", "demo", false, profile).ok).toBe(false);
  });
});

function fixture(bundle = '[{insert:[{id:active,name:demo},{id:optional,name:demo/optional,disabled:true}]}]', user = '[]') {
  const profile = temporaryProfile('dsh-top100-toggle-state-');
  const packageDir = join(profile, 'node_modules/demo');
  mkdirSync(packageDir, {recursive:true});
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({dsh:{bundle:{patch:'bundle.yml'}}}));
  // Use JSON-compatible flow spacing for js-yaml's JSON schema.
  writeFileSync(join(packageDir, 'bundle.yml'), bundle.replace(/:(?=[a-z{[])/g, ': '));
  const path = join(profile,'cordis.patch.yml');
  writeFileSync(path, user);
  return {profile, path, packageDir, state: () => applyDshPatches([
    ...readDshPatch(readFileSync(join(packageDir,'bundle.yml'),'utf8')),
    ...readDshPatch(readFileSync(path,'utf8')),
  ])};
}

describe('reversible package disable overlays', () => {
  it('preserves permissions on toggle and cleanup, and creates new files privately', () => {
    const f = fixture();
    chmodSync(f.path, 0o600);
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(true);
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
    expect(setRowDisabled(f.path,'active',true).ok).toBe(true);
    removeRowBlocks(f.path,['active']);
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
    rmSync(f.path);
    expect(setRowDisabled(f.path,'active',true).ok).toBe(true);
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
  });
  it('restores default-off and user-disabled rows without an in-memory snapshot', () => {
    const f = fixture(undefined, '- id: optional\n  disabled: true\n  config: { kept: value }\n');
    const before = f.state();
    expect(packageIsDisabled('web','demo',f.profile)).toBe(false);
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    const off = readFileSync(f.path,'utf8');
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    expect(readFileSync(f.path,'utf8')).toBe(off);
    // Copying to another profile proves recovery comes from the patch itself.
    const copied = fixture(undefined, off);
    expect(setPackageEnabled('web','demo',true,copied.profile).ok).toBe(true);
    expect(copied.state()).toEqual(before);
    expect(packageIsDisabled('web','demo',copied.profile)).toBe(false);
  });
  it('ignores mismatched name guards and accounts for disabled groups', () => {
    const f = fixture(undefined, '- id: active\n  name: wrong-module\n  disabled: true\n');
    expect(packageIsDisabled('web','demo',f.profile)).toBe(false);
    writeFileSync(f.path, '- id: active\n  name: demo\n  disabled: true\n');
    expect(packageIsDisabled('web','demo',f.profile)).toBe(true);
    const grouped = fixture('[{insert: [{id: parent, group: true, disabled: true, config: [{id: child, name: demo}]}]}]');
    expect(packageIsDisabled('web','demo',grouped.profile)).toBe(true);
    expect(disabledRowIds(grouped.state())).toEqual(new Set(['parent','child']));
  });
  it('preserves later user overrides and blocks tampered managed blocks', () => {
    const f = fixture();
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    expect(setRowDisabled(f.path,'optional',false).ok).toBe(true);
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(true);
    expect(disabledRowIds(f.state()).has('optional')).toBe(false);
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    const modified = readFileSync(f.path,'utf8').replace('disabled: true','disabled: false');
    writeFileSync(f.path,modified);
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(false);
    expect(readFileSync(f.path,'utf8')).toBe(modified);
  });
  it('keeps two package overlays independent across other edit and cleanup paths', () => {
    const f = fixture();
    const other = join(f.profile, 'node_modules/other'); mkdirSync(other);
    writeFileSync(join(other,'package.json'), JSON.stringify({dsh:{bundle:{patch:'bundle.yml'}}}));
    writeFileSync(join(other,'bundle.yml'), '- insert: [{id: other, name: other}]\n');
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    expect(setPackageEnabled('web','other',false,f.profile).ok).toBe(true);
    expect(setRowDisabled(f.path,'unrelated',true).ok).toBe(true);
    removeRowBlocks(f.path,['unrelated']);
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(true);
    expect(packageIsDisabled('web','other',f.profile)).toBe(true);
    expect(setPackageEnabled('web','other',true,f.profile).ok).toBe(true);
    expect(readDshPatch(readFileSync(f.path,'utf8'))).toEqual([]);
  });
  it('does not report a stale overlay successful after a bundle changes loader names', () => {
    const f = fixture();
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    writeFileSync(join(f.packageDir,'bundle.yml'), '- insert: [{id: active, name: demo/new}]\n');
    expect(packageIsDisabled('web','demo',f.profile)).toBe(false);
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(false);
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(true);
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    expect(packageIsDisabled('web','demo',f.profile)).toBe(true);
  });
  it('handles aliases across the managed block without losing subsequent user edits', () => {
    const f = fixture(undefined, '- id: active\n  config: &shared {a: b}\n');
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
    // Keep a valid explicit anchor across sections, as an external editor can do.
    writeFileSync(f.path, readFileSync(f.path,'utf8').replace('config:\n', 'config: &shared\n') + '- id: optional\n  config: *shared\n');
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(true);
    expect(f.state().map(row=>row.config)).toEqual([{a:'b'},{a:'b'}]);
  });
});


describe('patch write conflicts', () => {
  it('preserves an external write detected before atomic replacement', async () => {
    const f = fixture();
    const write = (await vi.importActual<typeof import("node:fs")>("node:fs")).writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((...args) => {
      const result = write(...args);
      if (String(args[0]).endsWith('.tmp')) write(f.path, '- id: active\n  config: {changed: externally}\n');
      return result;
    });
    expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(false);
    expect(readFileSync(f.path,'utf8')).toContain('changed: externally');
  });
  it('does not claim enable succeeded when a user configuration still disables every row', () => {
    const f = fixture(undefined, '- id: active\n  disabled: true\n  config: {kept: true}\n');
    const before = readFileSync(f.path,'utf8');
    expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(false);
    expect(readFileSync(f.path,'utf8')).toBe(before);
  });
});


it('composes a child inserted into an earlier bundle group for toggles and status', () => {
  const f = fixture('- id: host-group\n  insert: [{id: plugin-child, name: demo}]\n');
  const host = join(f.profile,'node_modules/host-bundle'); mkdirSync(host);
  writeFileSync(join(host,'package.json'),JSON.stringify({dsh:{bundle:{patch:'bundle.yml'}}}));
  writeFileSync(join(host,'bundle.yml'),'- insert: [{id: host-group, group: true, config: []}]\n');
  writeFileSync(join(f.profile,'package.json'),JSON.stringify({dependencies:{'host-bundle':'1',demo:'1'},dsh:{profile:{bundles:['host-bundle','demo']}}}));
  expect(packageIsDisabled('web','demo',f.profile)).toBe(false);
  expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
  expect(packageIsDisabled('web','demo',f.profile)).toBe(true);
  expect(setPackageEnabled('web','demo',false,f.profile).ok).toBe(true);
  expect(setPackageEnabled('web','demo',true,f.profile).ok).toBe(true);
  expect(packageIsDisabled('web','demo',f.profile)).toBe(false);
});
