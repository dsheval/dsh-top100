import { describe, expect, it } from "vitest";
import { normalizeInstallTarget, parseDshInstallCommand, parseDshInstallCommandDetails, resolveCatalogInstallTarget } from "../src/shared/install-source.js";

describe("shared install source parser", () => {
  it.each([
    "dsh plugin add @acme/demo@1.2.3",
    "dsh plugin --profile web add @acme/demo@1.2.3",
    "dsh --profile=web plugin add '@acme/demo@1.2.3'",
    'dsh plugin add "@acme/demo@1.2.3" --profile web # install the plugin',
    "npx @deepseek-ai/dsh plugin --profile web add @acme/demo@1.2.3",
    "npx --yes @deepseek-ai/dsh@0.1.1-rc.2 plugin add @acme/demo@1.2.3",
    "npx -y @deepseek-ai/dsh@latest -- plugin add -- @acme/demo@1.2.3",
    "dsh plugin --profile web add --save-exact @acme/demo@1.2.3",
    "dsh plugin --profile web add -w @acme/demo@1.2.3",
    "pnpm dsh plugin add @acme/demo@1.2.3",
    "pnpm exec dsh plugin add @acme/demo@1.2.3",
    "corepack pnpm dsh plugin add @acme/demo@1.2.3",
    "corepack pnpm exec dsh plugin --profile web add @acme/demo@1.2.3",
    "dsh plugin add npm:@acme/demo@1.2.3",
    "dsh plugin add @acme/demo@1.2.3 --registry=https://registry.npmjs.org/",
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
    "dsh plugin add demo other",
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
    "pnpm dlx @evil/dsh plugin add demo", "corepack npm dsh plugin add demo",
    "corepack pnpm exec @evil/dsh plugin add demo", "pnpm --dir /tmp dsh plugin add demo",
    "pnpm add @acme/demo", "dsh --save-exact plugin add demo",
    "dsh plugin add --save-exact --save-exact demo", "dsh plugin add -w -w demo",
    "dsh plugin add demo --registry", "dsh plugin add demo --registry=https://registry.npmjs.org/ --registry=https://registry.npmjs.org/",
    "dsh plugin add demo --registry=https://user:pass@registry.npmjs.org/",
    "dsh plugin add npm:demo@npm:other", "dsh plugin add npm:https://evil.test/a.tgz",
    "dsh plugin --profile <your-profile> add demo",
  ])("keeps unsupported or unsafe commands unrecognized: %s", (command) => {
    expect(parseDshInstallCommand(command)).toBeNull();
  });

  it("retains author profile and registry conditions without installing them into another environment", () => {
    const command = "corepack pnpm exec dsh plugin --profile research add -w --save-exact @acme/demo@1.2.3 --registry=https://packages.example/npm";
    expect(parseDshInstallCommandDetails(command)).toEqual({ target: "@acme/demo@1.2.3", profile: "research", registry: "https://packages.example/npm", saveExact: true, workspace: true });
    expect(parseDshInstallCommand(command)).toBe("@acme/demo@1.2.3"); // syntax only
    const entry = { fullName: "acme/demo", install: { packageName: "@acme/demo", commands: [command] } };
    expect(resolveCatalogInstallTarget(entry)).toBeNull();
    expect(resolveCatalogInstallTarget(entry, { profile: "research" })).toBeNull(); // registry remains unsupported
    expect(resolveCatalogInstallTarget({ ...entry, installTarget: "@acme/demo@1.2.3" })).toBeNull(); // stale compact hint cannot bypass full commands
    entry.install.commands = ["dsh plugin --profile research add @acme/demo"];
    expect(resolveCatalogInstallTarget(entry)).toBeNull();
    expect(resolveCatalogInstallTarget(entry, { profile: "research" })).toBe("@acme/demo");
    entry.install.commands = ["dsh plugin --profile tui add @acme/demo"];
    expect(resolveCatalogInstallTarget(entry)).toBeNull();
    expect(resolveCatalogInstallTarget({ ...entry, type: "skill" })).toBeNull(); // no Git fallback around explicit conditions
    expect(resolveCatalogInstallTarget(entry, { profile: "tui" })).toBe("@acme/demo");
  });

  it.each(["http://registry.npmjs.org/", "https://registry.npmjs.org/other", "https://registry.npmjs.org.evil.test/", "https://registry.npmjs.org:8443/", "https://mirror.example/"])("does not silently substitute the default registry for %s", (registry) => {
    expect(resolveCatalogInstallTarget({ fullName: "acme/demo", install: { packageName: "demo", commands: [`dsh plugin add demo --registry ${registry}`] } })).toBeNull();
  });

  it("normalizes only standard npm protocol targets", () => {
    expect(normalizeInstallTarget("npm:@acme/demo@stable")).toBe("@acme/demo@stable");
    expect(normalizeInstallTarget("npm:demo")).toBe("demo");
    for (const value of ["npm:", "npm:--help", "npm:-w", "npm:alias@npm:demo", "npm:file:./demo", "npm:github:acme/demo"]) expect(normalizeInstallTarget(value)).toBeNull();
  });

  it("prefers a matching author npm release over source transport, without inferring from a bare name", () => {
    const entry = { fullName: "acme/demo", install: { packageName: "@acme/demo", commands: ["dsh plugin add github:acme/demo#main", "dsh plugin add @acme/demo@1.2.3"] } };
    expect(resolveCatalogInstallTarget(entry)).toBe("@acme/demo@1.2.3");
    expect(resolveCatalogInstallTarget({ ...entry, install: { ...entry.install, commands: [entry.install.commands[0], "dsh plugin add other-market"] } })).toBe("github:acme/demo#main");
    expect(resolveCatalogInstallTarget({ ...entry, install: { packageName: "@acme/demo" } })).toBeNull();
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
