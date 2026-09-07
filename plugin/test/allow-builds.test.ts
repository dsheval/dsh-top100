import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allowPackageBuild } from "../src/install/allow-builds.js";
import { load } from "js-yaml";

const previousHome = process.env.DSH_HOME;
const temporaryHomes: string[] = [];
function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), "dsh-top100-allow-"));
  temporaryHomes.push(home);
  return home;
}

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("allowPackageBuild", () => {
  it("appends one exact package to allowBuilds", () => {
    const home = temporaryHome();
    const profile = join(home, "profiles", "web");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    process.env.DSH_HOME = home;
    expect(allowPackageBuild("web", "@acme/demo")).toBe(true);
    expect(allowPackageBuild("web", "@acme/demo")).toBe(false);
    expect(readFileSync(join(profile, "pnpm-workspace.yaml"), "utf8")).toContain("'@acme/demo': true");
  });

  it("merges GitHub keys and repairs duplicate CRLF blocks", () => {
    const home = temporaryHome();
    const profile = join(home, "profiles", "web");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\r\n  - .\r\nallowBuilds:\r\n  old: false\r\nallowBuilds:\r\n  stale: true\r\n");
    process.env.DSH_HOME = home;
    const sha = "b".repeat(40);
    expect(allowPackageBuild("web", [
      "demo@git+https://github.com/acme/repo.git",
      `demo@https://codeload.github.com/acme/repo/tar.gz/${sha}`,
    ])).toBe(true);
    const yaml = readFileSync(join(profile, "pnpm-workspace.yaml"), "utf8");
    expect(yaml.match(/allowBuilds:/g)).toHaveLength(1);
    expect(yaml).toContain("demo@git+https://github.com/acme/repo.git: true");
    expect(yaml).toContain(`demo@https://codeload.github.com/acme/repo/tar.gz/${sha}: true`);
    expect(yaml).toContain("\r\n");
    expect(load(yaml)).toMatchObject({ allowBuilds: { old: false, stale: true } });
  });

  it.each([
    "packages: [.]\nallowBuilds: { old: false, prior: true }\nsettings: { nested: { keep: false } }\n",
    "{ packages: [.], allowBuilds: { old: false, prior: true }, settings: { nested: { keep: false } } }\n",
    "packages:\n  - .\nallowBuilds:\n  old: false # explicit refusal\n  prior: true\nsettings:\n  nested:\n    keep: false\n",
  ])("merges legal flow/block maps without losing existing decisions or other settings", (source) => {
    const directory = temporaryHome();
    const path = join(directory, "pnpm-workspace.yaml");
    writeFileSync(path, source);
    expect(allowPackageBuild("web", "fresh", directory)).toBe(true);
    expect(load(readFileSync(path, "utf8"))).toEqual({
      packages: ["."], allowBuilds: { old: false, prior: true, fresh: true }, settings: { nested: { keep: false } },
    });
    expect(allowPackageBuild("web", "fresh", directory)).toBe(false);
  });

  it("preserves inherited YAML approvals and only changes explicitly approved keys", () => {
    const directory = temporaryHome();
    const path = join(directory, "pnpm-workspace.yaml");
    writeFileSync(path, "defaults: &defaults\n  allowBuilds: { denied: false, approved: true }\n<<: *defaults\npackages: [.]\n");
    allowPackageBuild("web", "fresh", directory);
    expect(load(readFileSync(path, "utf8"))).toMatchObject({ allowBuilds: { denied: false, approved: true, fresh: true } });
  });

  it("preserves alias-based approvals and unrelated mappings when adding a key", () => {
    const directory = temporaryHome();
    const path = join(directory, "pnpm-workspace.yaml");
    writeFileSync(path, "defaults: &approvals { denied: false, approved: true }\nallowBuilds: *approvals\nsettings: { allowBuilds: { nested: false } }\n");
    allowPackageBuild("web", "fresh", directory);
    expect(load(readFileSync(path, "utf8"))).toEqual({
      defaults: { denied: false, approved: true }, allowBuilds: { denied: false, approved: true, fresh: true },
      settings: { allowBuilds: { nested: false } },
    });
  });

  it.each(["allowBuilds: [old]\n", "allowBuilds: { old: maybe }\n", "packages: [.]\npackages: [other]\n", "[broken", "settings: &cycle { again: *cycle }\n"])("leaves malformed or ambiguous workspace settings untouched", (source) => {
    const directory = temporaryHome();
    const path = join(directory, "pnpm-workspace.yaml");
    writeFileSync(path, source);
    expect(() => allowPackageBuild("web", "fresh", directory)).toThrow();
    expect(readFileSync(path, "utf8")).toBe(source);
  });
});
