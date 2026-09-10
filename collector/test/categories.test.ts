import { describe, expect, it } from "vitest";
import {
  CATEGORY_DEFINITIONS,
  fallbackCategoryAssignments,
  normalizeCategoryAssignments,
  bindCategoryAssignments,
  currentCategoryAssignments,
  categorySourceHash,
} from "../src/categories.js";

describe("controlled repository categories", () => {
  it("exposes the six product categories in display order", () => {
    expect(CATEGORY_DEFINITIONS.map(({ id, label }) => [id, label])).toEqual([
      ["ai", "Agent 增强"],
      ["appearance", "外观"],
      ["coding", "编程"],
      ["knowledge", "知识"],
      ["tools", "工具"],
      ["security", "安全"],
    ]);
  });

  it("keeps at most three strongest assignments", () => {
    const categories = normalizeCategoryAssignments([
      { id: "coding", confidence: 0.95, evidence: "代码审查", source: "deepseek" },
      { id: "tools", confidence: 0.81, evidence: "自动化流程", source: "deepseek" },
      { id: "security", confidence: 0.72, evidence: "权限审计", source: "deepseek" },
    ]);
    expect(categories.map(({ id }) => id)).toEqual(["coding", "tools", "security"]);
  });

  it("does not classify installation text, topics or generated tags as product capabilities", () => {
    expect(fallbackCategoryAssignments({ name: "dsh-theme", description: "A visual theme plugin", readmeSummary: "Install with git. Requires an API key. See the code examples and docs.", topics: ["ai-agent", "github"], tags: ["代码", "知识"] }).map(c => c.id)).toEqual(["appearance"]);
  });
  it("distinguishes plugin market search from knowledge retrieval", () => {
    expect(fallbackCategoryAssignments({ name: "market", description: "插件市场：搜索并安装社区插件" }).map(c => c.id)).toEqual(["tools"]);
    expect(fallbackCategoryAssignments({ name: "search", description: "提供网页搜索与知识检索" }).map(c => c.id)).toEqual(["knowledge"]);
  });
  it("does not mistake browser automation or a provider login for research/security", () => {
    expect(fallbackCategoryAssignments({ name: "browser", description: "Browser automation for your coding agent, with OAuth login" }).map(c => c.id)).toEqual(["tools"]);
    expect(fallbackCategoryAssignments({ name: "provider", description: "Model provider using OAuth" }).map(c => c.id)).toEqual(["ai"]);
  });
  it("does not attribute the root product purpose to a selected subpackage", () => {
    expect(fallbackCategoryAssignments({ name: "panel", description: "Knowledge base and academic research", readmeSummary: "Code review with git integration", install: { repositoryPath: "packages/review" } }).map(c => c.id)).toEqual(["coding"]);
  });
  it("leaves insufficient or ambiguous evidence for review", () => {
    expect(fallbackCategoryAssignments({ name: "dsh-ai-git", description: "A plugin for DSH", topics: ["security", "research"] })).toEqual([]);
  });
  it("expires old classifications when source evidence or policy changes", () => {
    const source = { name: "theme", description: "A theme plugin", install: { packageName: "theme", repositoryPath: "packages/theme" } };
    const old = [{ id: "appearance" as const, confidence: 0.9, evidence: "A theme", source: "deepseek" as const }];
    expect(currentCategoryAssignments(source, old)).toEqual([]);
    const current = bindCategoryAssignments(source, old);
    expect(currentCategoryAssignments(source, current)).toHaveLength(1);
    expect(currentCategoryAssignments({ ...source, description: "A security audit tool" }, current)).toEqual([]);
    expect(categorySourceHash(source)).not.toBe(categorySourceHash({ ...source, topics: ["updated"] }));
    expect(currentCategoryAssignments({ ...source, install: { ...source.install, packageName: "other" } }, current)).toEqual([]);
    expect(currentCategoryAssignments({ ...source, install: { ...source.install, repositoryPath: "packages/other" } }, current)).toEqual([]);
  });
});
