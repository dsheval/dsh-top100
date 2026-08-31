import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dropFromManifest,
  isDshProfileName,
  readProfileManifestSnapshot,
  resolveActiveProfile,
  restoreProfileManifest,
} from "../src/host/profile.js";

function profileFixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-top100-profile-"));
  mkdirSync(join(directory, "node_modules"), { recursive: true });
  writeFileSync(join(directory, "package.json"), `${JSON.stringify({
    name: "profile-web",
    dependencies: { "keep-plugin": "1.0.0" },
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-web-app", "keep-plugin"] } },
    untouched: { value: true },
  }, null, 2)}\n`);
  return directory;
}

describe("profile resolution", () => {
  it("uses the booted CLI profile when no explicit plugin profile is configured", () => {
    expect(resolveActiveProfile(undefined, ["node", "dsh", "--profile", "testing"])).toBe("testing");
    expect(resolveActiveProfile("custom", ["node", "dsh", "--profile", "testing"])).toBe("custom");
    expect(resolveActiveProfile(undefined, ["node", "dsh"])).toBe("web");
  });

  it("accepts DSH profile names with dots, spaces, and Unicode but rejects traversal", () => {
    expect(isDshProfileName("test.profile")).toBe(true);
    expect(isDshProfileName("测试 环境")).toBe(true);
    expect(isDshProfileName("../web")).toBe(false);
    expect(isDshProfileName("node_modules")).toBe(false);
  });
});

describe("profile manifest recovery", () => {
  it("restores dependencies and bundle rows after a failed add", () => {
    const directory = profileFixture();
    const snapshot = readProfileManifestSnapshot("web", directory);
    const path = join(directory, "package.json");
    const changed = JSON.parse(readFileSync(path, "utf8"));
    changed.dependencies["broken-plugin"] = "github:acme/broken";
    changed.dsh.profile.bundles.push("broken-plugin");
    changed.untouched.value = "preserve me";
    writeFileSync(path, `${JSON.stringify(changed, null, 2)}\n`);

    expect(restoreProfileManifest("web", snapshot, directory)).toEqual(expect.arrayContaining([
      "broken-plugin",
      "dsh.profile.bundles",
    ]));
    const restored = JSON.parse(readFileSync(path, "utf8"));
    expect(restored.dependencies).toEqual({ "keep-plugin": "1.0.0" });
    expect(restored.dsh.profile.bundles).toEqual(["@deepseek-ai/dsh-web-app", "keep-plugin"]);
    expect(restored.untouched.value).toBe("preserve me");
  });

  it("restores the lockfile so an update can rematerialize the previous commit", () => {
    const directory = profileFixture();
    const lockPath = join(directory, "pnpm-lock.yaml");
    writeFileSync(lockPath, "lockfileVersion: '9.0'\ncommit: old\n");
    const snapshot = readProfileManifestSnapshot("web", directory);
    writeFileSync(lockPath, "lockfileVersion: '9.0'\ncommit: new\n");
    expect(restoreProfileManifest("web", snapshot, directory)).toContain("pnpm-lock.yaml");
    expect(readFileSync(lockPath, "utf8")).toContain("commit: old");
  });

  it("restores workspace build approvals after a failed package operation", () => {
    const directory = profileFixture();
    const workspacePath = join(directory, "pnpm-workspace.yaml");
    writeFileSync(workspacePath, "packages:\n  - .\n");
    const snapshot = readProfileManifestSnapshot("web", directory);
    writeFileSync(workspacePath, "packages:\n  - .\nallowBuilds:\n  risky-plugin: true\n");

    expect(restoreProfileManifest("web", snapshot, directory)).toContain("pnpm-workspace.yaml");
    expect(readFileSync(workspacePath, "utf8")).toBe("packages:\n  - .\n");
  });

  it("removes both manifest references after a half-uninstall", () => {
    const directory = profileFixture();
    expect(dropFromManifest("web", "keep-plugin", directory)).toBe(true);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    expect(manifest.dependencies["keep-plugin"]).toBeUndefined();
    expect(manifest.dsh.profile.bundles).toEqual(["@deepseek-ai/dsh-web-app"]);
  });
});
