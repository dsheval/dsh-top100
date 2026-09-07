import { describe, expect, it } from "vitest";
import { parseGitHubSource, githubInstallTarget, githubRepositoryIdentity } from "../src/shared/github-source.js";
import { parseInstallSpec, isInstalledEntry, isNpmRegistrySpecifier } from "../src/install/install-spec.js";
import { resolveUpdateTarget } from "../src/host/manage.js";
import type { RankingEntry } from "../src/shared/types.js";

const sha = "a".repeat(40);
describe("shared GitHub source normalization", () => {
  it.each([
    "github:Acme/Mono", "acme/mono", "https://github.com/acme/mono.git",
    "git+https://github.com/acme/mono.git", "git://github.com/acme/mono.git",
    "ssh://git@github.com/acme/mono.git", "git+ssh://git@github.com/acme/mono.git",
    "ssh://git@github.com:22/acme/mono.git", "git@github.com:acme/mono.git",
  ])("preserves immutable ref and subdirectory from %s", (base) => {
    const raw = `${base}#${sha}&path:/packages/demo`;
    const source = parseGitHubSource(raw);
    expect(source).toEqual({ repository: "acme/mono", ref: sha, path: "packages/demo" });
    expect(githubInstallTarget(source!)).toBe(`github:acme/mono#${sha}&path:/packages/demo`);
    expect(resolveUpdateTarget("@acme/demo", raw)).toBe("github:acme/mono#path:/packages/demo");
    expect(githubRepositoryIdentity(raw)).toBe("acme/mono");
  });

  it.each([
    "https://github.com/acme/mono/tree/main/packages/demo",
    "https://github.com/acme/mono/tree/feature/branch/packages/demo",
  ])("recognizes repository identity without inferring branch/path from a browser URL", (url) => {
    expect(githubRepositoryIdentity({ url, directory: "packages/demo" })).toBe("acme/mono");
    expect(parseGitHubSource(url)).toBeNull();
    expect(parseInstallSpec(url)).toBeNull();
    expect(resolveUpdateTarget("@acme/demo", url)).toBeNull();
  });

  it.each([
    "https://notgithub.com/acme/mono", "https://evil.test/github.com/acme/mono",
    "https://github.com.evil.test/acme/mono", "https://github.com@evil.test/acme/mono",
    "https://github.com/acme/mono?source=other", "https://github.com:8443/acme/mono",
    "https://github.com/a/../acme/mono", "https://github.com/%61cme/mono",
    "git+https://evil.test/acme/mono.git", "git@evil.test:acme/mono.git",
    "github:acme/mono#main&other", "github:acme/mono#path:/../other",
    "github:acme/mono#main&path:/packages/demo&path:/other", "github:acme/mono#path:/packages//demo",
  ])("does not interpret ambiguous or foreign source as a GitHub install: %s", (spec) => {
    expect(parseGitHubSource(spec)).toBeNull();
    expect(resolveUpdateTarget("demo", spec)).toBeNull();
  });

  it("shares source recognition with catalog parsing without allowing raw command separators", () => {
    expect(parseInstallSpec("git+ssh://git@github.com/acme/mono.git#path:/packages/demo"))
      .toEqual({ kind: "github", spec: "github:acme/mono#path:/packages/demo" });
    expect(parseInstallSpec(`github:acme/mono#${sha}&path:/packages/demo`)).toBeNull();
  });
});

describe("registry sources and installed identity", () => {
  it.each(["1.2.3", "^1.2.3", "~1.2.3", ">=1.0.0 <2", "1.2.x", "*", "latest", "next", "1.2.3-beta.1"])("recognizes registry spec %s", (spec) => {
    expect(isNpmRegistrySpecifier(spec)).toBe(true);
    expect(resolveUpdateTarget("@acme/demo", spec)).toBe("@acme/demo@latest");
  });
  it.each(["npm:other@1.0.0", "npm:@other/demo@1.0.0", "file:../demo", "link:../demo", "workspace:*", "https://registry.test/demo.tgz", "demo@1.0.0", "@acme/demo@1.0.0", ""])("never switches unsupported spec %s to a same-name registry package", (spec) => {
    expect(isNpmRegistrySpecifier(spec)).toBe(false);
    expect(resolveUpdateTarget("@acme/demo", spec)).toBeNull();
  });
  it("uses exact repository, package and path instead of names or URL prefixes", () => {
    const entry = { fullName: "acme/mono", name: "mono", install: { packageName: "@acme/demo", repositoryPath: "packages/demo", commands: ["dsh plugin add github:acme/mono#path:/packages/demo"] } } as RankingEntry;
    expect(isInstalledEntry(entry, { "@acme/demo": `git+https://github.com/acme/mono.git#${sha}&path:/packages/demo` })).toBe(true);
    expect(isInstalledEntry(entry, { "@acme/demo": `git+ssh://git@github.com/acme/mono.git#${sha}&path:/packages/other` })).toBe(false);
    expect(isInstalledEntry(entry, { "@acme/demo": `git+https://github.com/acme/mono.git-other#${sha}` })).toBe(false);
    expect(isInstalledEntry(entry, { "@other/demo": `github:acme/mono#${sha}&path:/packages/demo` })).toBe(false);
    expect(isInstalledEntry(entry, { "@acme/demo": "npm:@other/demo@1.0.0" })).toBe(false);
  });
});
