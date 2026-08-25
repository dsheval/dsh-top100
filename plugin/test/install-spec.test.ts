import { describe, expect, it } from "vitest";
import {
  isCordisEntry,
  isInstalledEntry,
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
    expect(parseInstallSpec("github:owner/repo#abc123")).toEqual({
      kind: "github",
      spec: "github:owner/repo#abc123",
    });
  });

  it("rejects shell metacharacters, flags, and non-plugin URLs", () => {
    expect(parseInstallSpec("dshmarket && rm -rf /")).toBeNull();
    expect(parseInstallSpec("github:owner/repo;id")).toBeNull();
    expect(parseInstallSpec("https://evil.example/pkg")).toBeNull();
    expect(parseInstallSpec("link:/tmp/plugin")).toBeNull();
    expect(parseInstallSpec("--yes")).toBeNull();
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

  it("falls back to github:owner/repo for cordis plugins", () => {
    expect(
      resolveInstallSpec(entry({ fullName: "acme/dsh-demo", type: "cordis-plugin" })),
    ).toEqual({ kind: "github", spec: "github:acme/dsh-demo" });
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
