import { describe, expect, it } from "vitest";
import {
  CATEGORY_DEFINITIONS,
  fallbackCategoryAssignments,
  normalizeCategoryAssignments,
} from "../src/categories.js";

describe("controlled repository categories", () => {
  it("exposes the six product categories in display order", () => {
    expect(CATEGORY_DEFINITIONS.map(({ id, label }) => [id, label])).toEqual([
      ["ai", "Agent 增强"],
      ["appearance", "外观"],
      ["coding", "编程"],
      ["knowledge", "知识获取"],
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

  it("does not scatter colleague-skill across several legacy categories", () => {
    const categories = fallbackCategoryAssignments({
      name: "colleague-skill",
      description: "把同事经验沉淀为可复用的 AI skill",
      readmeSummary: "Capture knowledge and prompt patterns for an AI agent.",
      topics: ["agentic", "knowledge"],
      tags: ["知识传承"],
    });
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories.length).toBeLessThanOrEqual(3);
    expect(categories.map(({ id }) => id)).toEqual(["ai", "knowledge"]);
  });
});
