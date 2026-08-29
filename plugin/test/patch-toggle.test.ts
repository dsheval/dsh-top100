import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageIsDisabled, parseInsertedIds, setPackageEnabled, userPatchPackageReferences } from "../src/host/patch-toggle.js";

describe("profile plugin toggle", () => {
  it("finds ids inserted by a bundle patch", () => {
    expect(parseInsertedIds("- insert:\n    id: demo\n    name: demo\n- id: ignored\n")).toEqual(["demo"]);
  });

  it("writes and removes a user disable without changing the bundle", () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-toggle-"));
    const packageDir = join(profile, "node_modules", "sample-plugin");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "package.json"), JSON.stringify({ dsh: { bundle: { patch: "cordis.patch.yml" } } }));
    writeFileSync(join(packageDir, "cordis.patch.yml"), "- insert:\n    id: sample-row\n    name: sample\n");
    writeFileSync(join(profile, "cordis.patch.yml"), "[]\n");

    expect(setPackageEnabled("web", "sample-plugin", false, profile).ok).toBe(true);
    expect(packageIsDisabled("web", "sample-plugin", profile)).toBe(true);
    expect(readFileSync(join(packageDir, "cordis.patch.yml"), "utf8")).toContain("sample-row");

    expect(setPackageEnabled("web", "sample-plugin", true, profile).ok).toBe(true);
    expect(packageIsDisabled("web", "sample-plugin", profile)).toBe(false);
  });

  it("finds user-owned insert references and ignores disable rows", () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-patch-ref-"));
    const patch = join(profile, "cordis.patch.yml");
    writeFileSync(patch, "- id: demo\n  disabled: true\n- insert:\n    - id: custom\n      name: '@acme/demo/subpath'\n");
    expect(userPatchPackageReferences(patch, "@acme/demo")).toEqual(["@acme/demo/subpath"]);
    expect(userPatchPackageReferences(patch, "unrelated")).toEqual([]);
  });

  it("parses flow-style inserts with the same YAML dialect as DSH", () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-patch-flow-"));
    const patch = join(profile, "cordis.patch.yml");
    writeFileSync(patch, "[{ insert: [{ id: demo, name: demo }] }]\n");
    expect(userPatchPackageReferences(patch, "demo")).toEqual(["demo"]);
  });

  it("does not confuse a plugin option named `name` with a loader reference", () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-patch-config-"));
    const patch = join(profile, "cordis.patch.yml");
    writeFileSync(patch, "- insert:\n    - id: owner\n      name: owner-plugin\n      config:\n        items:\n          - name: demo\n");
    expect(userPatchPackageReferences(patch, "demo")).toEqual([]);
  });
});
