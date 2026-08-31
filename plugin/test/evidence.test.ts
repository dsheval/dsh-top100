import { describe, expect, it } from "vitest";
import { catalogEvidence, classifyFormFactor } from "../src/shared/evidence.js";
import type { RankingEntry } from "../src/shared/types.js";

function entry(extra: Partial<RankingEntry> = {}): RankingEntry {
  return {
    rank: 1,
    fullName: "acme/example",
    name: "example",
    owner: "acme",
    description: "Example extension",
    descriptionZh: "示例扩展",
    stars: 10,
    dailyStars: 1,
    weeklyStars: 2,
    hotScore: 1,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    tags: [],
    categories: [],
    type: "project",
    sources: [],
    url: "https://github.com/acme/example",
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

describe("catalog evidence", () => {
  it("lets an installable Cordis bundle outrank incidental MCP or desktop wording", () => {
    const plugin = entry({
      type: "cordis-plugin",
      description: "Cordis plugin that controls an MCP desktop client",
      install: { method: "pnpm-profile", commands: ["dsh plugin --profile web add @acme/example"] },
    });

    expect(classifyFormFactor(plugin)).toBe("dsh-bundle");
    expect(catalogEvidence(plugin)).toMatchObject({
      compatible: true,
      trustLevel: "install-source",
      signalCodes: ["indexed", "dsh-bundle", "install-source"],
      caveatCode: "not-security-review",
    });
  });

  it("distinguishes a generic Agent Skill from a DSH-specific Skill", () => {
    expect(classifyFormFactor(entry({ type: "skill", description: "Agent skill for research" })))
      .toBe("agent-skill");
    expect(classifyFormFactor(entry({ type: "skill", description: "Skill for DeepSeek Harness" })))
      .toBe("dsh-skill");
  });

  it("keeps ecosystem candidates indexed without claiming compatibility or review", () => {
    expect(catalogEvidence(entry())).toMatchObject({
      formFactor: "candidate",
      compatible: false,
      trustLevel: "indexed",
      caveat: expect.stringContaining("不代表代码已通过安全审核"),
    });
  });

  it("does not turn theme wording alone into a DSH compatibility claim", () => {
    expect(catalogEvidence(entry({ name: "dark-theme", description: "Dark theme colors" })))
      .toMatchObject({
        formFactor: "theme",
        compatible: false,
        trustLevel: "indexed",
        signalCodes: ["indexed"],
        signals: ["已进入 DSHEval 索引"],
      });
  });
});
