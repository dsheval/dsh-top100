import { describe, expect, it } from "vitest";
import { parseDshInstallCommand, resolveCatalogInstallTarget } from "../src/shared/install-source.js";

describe("shared install source parser", () => {
  it.each([
    "dsh plugin add @acme/demo@1.2.3",
    "dsh plugin --profile web add @acme/demo@1.2.3",
    "dsh --profile=web plugin add '@acme/demo@1.2.3'",
    'dsh plugin add "@acme/demo@1.2.3" --profile web # install the plugin',
    "npx @deepseek-ai/dsh plugin --profile web add @acme/demo@1.2.3",
    "npx --yes @deepseek-ai/dsh@0.1.1-rc.2 plugin add @acme/demo@1.2.3",
    "npx -y @deepseek-ai/dsh@latest -- plugin add -- @acme/demo@1.2.3",
  ])("recognizes the official launcher and profile variants: %s", (command) => {
    expect(parseDshInstallCommand(command)).toBe("@acme/demo@1.2.3");
  });

  it.each([
    "https://github.com/acme/demo", "https://github.com/acme/demo.git",
    "git+https://github.com/acme/demo.git", "https://github.com/acme/demo/",
  ])("normalizes only a GitHub repository URL: %s", (target) => {
    expect(parseDshInstallCommand(`dsh plugin add ${target}#v1.2.3`)).toBe("github:acme/demo#v1.2.3");
  });

  it.each([
    "echo dsh plugin add demo", "npx @evil/dsh plugin add demo",
    "dsh plugin add demo && echo unsafe", "dsh plugin add demo;id",
    "dsh plugin add $(echo demo)", "dsh plugin add `echo demo`",
    "dsh plugin add demo other", "dsh plugin add demo --registry https://evil.test",
    "dsh plugin add demo --ignore-scripts", "dsh plugin add demo --profile",
    "dsh plugin add demo --profile web --profile other",
    "dsh plugin add 'demo\"", "dsh plugin add ./demo", "dsh plugin add file:../demo",
    "dsh plugin add https://github.com.evil.test/acme/demo",
    "dsh plugin add https://github.com@evil.test/acme/demo",
    "dsh plugin add https://github.com/acme/demo?download=1",
    "dsh plugin add https://github.com/acme/demo/tree/main",
    "dsh plugin add https://github.com/acme/demo/../other",
    "dsh plugin add https://evil.test/acme/demo.tgz",
    "dsh plugin add github:acme/demo#sha&path:packages/demo",
  ])("keeps unsupported or unsafe commands unrecognized: %s", (command) => {
    expect(parseDshInstallCommand(command)).toBeNull();
  });

  it("preserves refs and requires the repository or npm identity to match", () => {
    expect(parseDshInstallCommand("dsh plugin add github:acme/demo#release/v1 # explanation")).toBe("github:acme/demo#release/v1");
    const entry = { fullName: "acme/demo", type: "cordis-plugin", install: { packageName: "@acme/demo", commands: [
      "dsh plugin add other-market", "dsh plugin add https://github.com/other/demo",
      "npx @deepseek-ai/dsh plugin add https://github.com/acme/demo.git#v1",
    ] } };
    expect(resolveCatalogInstallTarget(entry)).toBe("github:acme/demo#v1");
    expect(resolveCatalogInstallTarget({ ...entry, install: { commands: entry.install.commands.slice(0, 2) } })).toBeNull();
    expect(resolveCatalogInstallTarget({ ...entry, install: { packageName: "@acme/demo" } })).toBeNull();
    expect(resolveCatalogInstallTarget({ ...entry, installTarget: "@other/demo", install: undefined })).toBeNull();
  });
});
