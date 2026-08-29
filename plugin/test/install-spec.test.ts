import { describe, expect, it } from "vitest";
import {
  isCordisEntry,
  isInstalledEntry,
  npmPackageSpec,
  parseInstallSpec,
  resolveInstallSpec,
} from "../src/install/install-spec.js";
import type { RankingEntry } from "../src/shared/types.js";

function entry(partial: Partial<RankingEntry> & Pick<RankingEntry, "fullName" | "type">): RankingEntry {
  return {
    rank: 1,
    name: partial.fullName.split("/")[1] ?? "plugin",
    owner: partial.fullName.split("/")[0] ?? "owner",
    description: "",
    descriptionZh: "",
    stars: 1,
    dailyStars: 0,
    weeklyStars: 0,
    hotScore: 0,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    tags: [],
    sources: [],
    url: `https://github.com/${partial.fullName}`,
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("parseInstallSpec", () => {
  it("accepts npm package names and github specs", () => {
    expect(parseInstallSpec("dshmarket")).toEqual({ kind: "npm", spec: "dshmarket" });
    expect(parseInstallSpec("@liustack/modlens")).toEqual({ kind: "npm", spec: "@liustack/modlens" });
    expect(parseInstallSpec("dsh-better-sidebar@latest")).toEqual({
      kind: "npm",
      spec: "dsh-better-sidebar@latest",
    });
    expect(parseInstallSpec("@acme/plugin@1.2.3-rc.1")).toEqual({
      kind: "npm",
      spec: "@acme/plugin@1.2.3-rc.1",
    });
    expect(parseInstallSpec("github:owner/repo#abc123")).toEqual({
      kind: "github",
      spec: "github:owner/repo#abc123",
    });
    expect(parseInstallSpec("github:owner/repo#path:/packages/plugin")).toEqual({
      kind: "github",
      spec: "github:owner/repo#path:/packages/plugin",
    });
  });

  it("rejects shell metacharacters, flags, and non-plugin URLs", () => {
    expect(parseInstallSpec("dshmarket && rm -rf /")).toBeNull();
    expect(parseInstallSpec("github:owner/repo;id")).toBeNull();
    expect(parseInstallSpec("https://evil.example/pkg")).toBeNull();
    expect(parseInstallSpec("link:/tmp/plugin")).toBeNull();
    expect(parseInstallSpec("--yes")).toBeNull();
    expect(parseInstallSpec("plugin@^1.0.0")).toBeNull();
  });

  it("separates an npm package name from its tag or exact version", () => {
    expect(npmPackageSpec("dshmarket")).toEqual({ name: "dshmarket", selector: null });
    expect(npmPackageSpec("@acme/plugin@next")).toEqual({ name: "@acme/plugin", selector: "next" });
  });
});

describe("resolveInstallSpec", () => {
  it("prefers a structured dsh plugin add command", () => {
    const spec = resolveInstallSpec(
      entry({
        fullName: "acme/demo",
        type: "skill",
        install: {
          method: "skills-add",
          commands: ["dsh plugin --profile web add dsh-better-sidebar"],
        },
      }),
    );
    expect(spec).toEqual({ kind: "npm", spec: "dsh-better-sidebar" });
  });

  it("keeps cordis entries without an author-provided add command browse-only", () => {
    expect(
      resolveInstallSpec(entry({ fullName: "acme/dsh-demo", type: "cordis-plugin" })),
    ).toBeNull();
  });

  it("preserves an npm tag from an author-provided add command", () => {
    expect(resolveInstallSpec(entry({
      fullName: "acme/dsh-demo",
      type: "cordis-plugin",
      install: { method: "pnpm-profile", commands: ["dsh plugin --profile web add @acme/dsh-demo@latest"] },
    }))).toEqual({ kind: "npm", spec: "@acme/dsh-demo@latest" });
  });

  it("falls back to github:owner/repo for catalogued skills", () => {
    expect(
      resolveInstallSpec(
        entry({
          fullName: "titanwings/colleague-skill",
          type: "skill",
          install: {
            method: "skills-add",
            commands: ["git clone https://github.com/titanwings/colleague-skill <TARGET>"],
          },
        }),
      ),
    ).toEqual({ kind: "github", spec: "github:titanwings/colleague-skill" });
  });
});

describe("installed matching", () => {
  it("matches npm names and github dependency specs", () => {
    const plugin = entry({ fullName: "dsh-market/dsh-market", type: "cordis-plugin" });
    expect(isInstalledEntry(plugin, { dshmarket: "^1.15.0" })).toBe(false);
    expect(isInstalledEntry(plugin, { "dsh-market": "github:dsh-market/dsh-market#main" })).toBe(true);
    expect(isCordisEntry(plugin)).toBe(true);
  });
});
