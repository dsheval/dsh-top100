import { describe, expect, it } from "vitest";
import { resolveUpdateSource } from "../src/host/update-source.js";
import type { InstallProvenance } from "../src/shared/types.js";

function provenance(extra: Partial<InstallProvenance> = {}): InstallProvenance {
  return {
    source: "npm", requestedTarget: "demo@beta", resolvedTarget: "demo@2.0.0-beta.1", packageName: "demo",
    version: "2.0.0-beta.1", commit: null, integrity: "sha512-test", verifiedAt: 1,
    repositoryUrl: "https://github.com/acme/demo", repositoryIdentity: "matched", ...extra,
  };
}

describe("release source preservation", () => {
  it.each(["beta", "next", "^1.0.0", "~0.2.1", ">=1.2.0 <2.0.0", "1.x || 2.x", "1.2.0 - 1.8.0"])("preserves the installed npm selector %s", (selector) => {
    expect(resolveUpdateSource("demo", selector)?.target).toBe(`demo@${selector}`);
  });

  it.each([
    ["1.2.3", "^1.2.3"], ["0.2.3", "~0.2.3"], ["0.0.3", "~0.0.3"], ["2.0.0-rc.1", "^2.0.0-rc.1"],
  ])("uses a compatible range for an unrecorded exact version %s", (version, range) => {
    expect(resolveUpdateSource("demo", version, { version })).toMatchObject({ target: `demo@${range}`, policy: expect.stringContaining(range) });
  });

  it("restores a recorded beta channel only when the installed pinned target matches", () => {
    expect(resolveUpdateSource("demo", "2.0.0-beta.1", { version: "2.0.0-beta.1", provenance: provenance() }))
      .toMatchObject({ target: "demo@beta", policy: "保留 npm beta 频道" });
  });

  it.each([
    { resolvedTarget: "demo@2.0.0-beta.0" }, { packageName: "other" }, { requestedTarget: "other@beta" },
    { source: "github" as const }, { version: "2.0.0-beta.0" }, { integrity: null }, { verifiedAt: NaN },
    { requestedTarget: "demo@next && id" },
  ])("does not restore npm selectors from mismatched evidence %j", (extra) => {
    expect(resolveUpdateSource("demo", "2.0.0-beta.1", { version: "2.0.0-beta.1", provenance: provenance(extra) })?.target)
      .toBe("demo@^2.0.0-beta.1");
  });

  it("does not override a user's subsequently edited dependency range with stale provenance", () => {
    expect(resolveUpdateSource("demo", "^2.0.0", { version: "2.0.0-beta.1", provenance: provenance() })?.target).toBe("demo@^2.0.0");
  });

  it("preserves a GitHub maintenance branch and case-sensitive monorepo path", () => {
    expect(resolveUpdateSource("demo", "git+https://github.com/acme/mono.git#release/1.x&path:/packages/Demo")?.target)
      .toBe("github:acme/mono#release/1.x&path:/packages/Demo");
  });

  const sha = "a".repeat(40);
  const githubProvenance = () => provenance({ source: "github", requestedTarget: "github:acme/mono#release/1.x&path:/packages/Demo",
    resolvedTarget: `github:acme/mono#${sha}&path:/packages/Demo`, commit: sha, version: "1.0.0" });

  it("restores the recorded GitHub maintenance branch after commit pinning", () => {
    expect(resolveUpdateSource("demo", `git+https://github.com/acme/mono.git#${sha}&path:/packages/Demo`, {
      version: "1.0.0", provenance: githubProvenance(),
    })?.target).toBe("github:acme/mono#release/1.x&path:/packages/Demo");
  });

  it.each([
    undefined,
    { commit: "b".repeat(40) }, { requestedTarget: "github:other/mono#release/1.x&path:/packages/Demo" },
    { requestedTarget: "github:acme/mono#release/1.x&path:/packages/demo" },
    { resolvedTarget: `github:acme/mono#${sha}&path:/packages/demo` }, { version: "2.0.0" },
  ])("requires explicit latest strategy for an unknown or mismatched GitHub commit %j", (extra) => {
    expect(() => resolveUpdateSource("demo", `github:acme/mono#${sha}&path:/packages/Demo`, {
      version: "1.0.0", provenance: extra ? { ...githubProvenance(), ...extra } : undefined,
    })).toThrow("无法确认原更新分支");
  });

  it("supports an explicit switch to latest without losing the installed GitHub path", () => {
    expect(resolveUpdateSource("demo", "beta", { strategy: "latest" })?.target).toBe("demo@latest");
    expect(resolveUpdateSource("demo", `github:acme/mono#${sha}&path:/packages/Demo`, { strategy: "latest" })?.target)
      .toBe("github:acme/mono#path:/packages/Demo");
  });
});
