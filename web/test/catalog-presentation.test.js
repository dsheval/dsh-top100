import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogPresentation,
  installCommand,
  resolveInstallTarget,
} from "../public/catalog-presentation.js";

test("accepts an allow-listed npm target from a DSH add command", () => {
  const entry = {
    fullName: "acme/demo",
    type: "cordis-plugin",
    install: { commands: ["dsh plugin --profile web add @acme/demo@1.2.3"] },
  };
  assert.equal(resolveInstallTarget(entry), "@acme/demo@1.2.3");
  assert.equal(
    installCommand(entry),
    "npx @deepseek-ai/dsh plugin --profile web add @acme/demo@1.2.3",
  );
  assert.equal(catalogPresentation(entry).trustLevel, "install-source");
});

test("uses a sanitized install target from the compact search index", () => {
  const entry = {
    fullName: "acme/demo",
    type: "cordis-plugin",
    installTarget: "@acme/demo@1.2.3",
  };
  assert.equal(resolveInstallTarget(entry), "@acme/demo@1.2.3");
  assert.equal(
    installCommand(entry),
    "npx @deepseek-ai/dsh plugin --profile web add @acme/demo@1.2.3",
  );
  assert.equal(resolveInstallTarget({ ...entry, installTarget: "demo;curl bad.example" }), null);
  assert.equal(resolveInstallTarget({ ...entry, installTarget: "github:owner/repo" }), null);
});

test("derives a GitHub install target only for a valid Skill repository", () => {
  const entry = { fullName: "acme/useful-skill", type: "skill", install: {} };
  assert.equal(resolveInstallTarget(entry), "github:acme/useful-skill");
  assert.equal(catalogPresentation(entry).formFactor, "Skill");
  assert.equal(resolveInstallTarget({ fullName: ".hidden/useful-skill", type: "skill" }), null);
});

test("rejects shell syntax and untrusted URLs from catalog commands", () => {
  for (const target of [
    "demo;curl bad.example",
    "https://bad.example/install.tgz",
    "demo && echo unsafe",
    "file:../demo",
    "github:.hidden/demo",
  ]) {
    assert.equal(resolveInstallTarget({
      fullName: "acme/demo",
      type: "cordis-plugin",
      install: { commands: [`dsh plugin add ${target}`] },
    }), null);
  }
});

test("does not offer install for an indexed-only ecosystem project", () => {
  const entry = { fullName: "acme/project", type: "candidate", install: {} };
  assert.equal(installCommand(entry), null);
  assert.deepEqual(catalogPresentation(entry), {
    formFactor: "生态项目",
    trustLevel: "indexed",
    trustLabel: "已进入索引",
    installable: false,
  });
});
