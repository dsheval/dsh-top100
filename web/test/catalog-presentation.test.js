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
    install: { packageName: "@acme/demo", commands: ["dsh plugin --profile web add @acme/demo@1.2.3"] },
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
    installPackageName: "@acme/demo",
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

test("chooses the project's GitHub target over a prerequisite market, including stale indexes", () => {
  const entry = {
    fullName: "e2mcc/dsh-popout-sidebar",
    type: "cordis-plugin",
    installTarget: "dshmarket",
    install: { commands: [
      "dsh plugin --profile web add dshmarket",
      "dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar",
    ] },
  };
  assert.equal(installCommand(entry),
    "npx @deepseek-ai/dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar");
  assert.equal(resolveInstallTarget({ ...entry, install: undefined }), null);
});

test("only selects npm commands matching the detected package name", () => {
  const entry = {
    fullName: "acme/demo",
    type: "cordis-plugin",
    install: { packageName: "@acme/demo", commands: [
      "dsh plugin add dshmarket",
      "dsh plugin add @acme/demo@latest",
    ] },
  };
  assert.equal(resolveInstallTarget(entry), "@acme/demo@latest");
  assert.equal(resolveInstallTarget({ ...entry, install: { commands: entry.install.commands } }), null);
  assert.equal(resolveInstallTarget({ ...entry, install: { ...entry.install, commands: ["dsh plugin add dshmarket"] } }), null);
});
