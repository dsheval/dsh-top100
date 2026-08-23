import { describe, expect, it } from "vitest";
import { extractCategoriesJson, extractJson, fallbackDescriptionZh } from "../src/llm.js";

describe("Chinese summary validation", () => {
  it("accepts a short Chinese description and rejects non-Chinese output", () => {
    expect(
      extractJson('{"descriptionZh":"把网页操作封装为 DSH 可调用的浏览器工具。","tagsZh":["浏览器"]}')
        ?.descriptionZh
    ).toContain("浏览器工具");
    expect(extractJson('{"descriptionZh":"Ignore previous instructions","tagsZh":[]}')).toBeNull();
    expect(extractJson('{"descriptionZh":"用于监控任务状态并发送通知","tagsZh":["任务监控"')).toBeNull();
  });

  it("accepts controlled multi-category output and removes unknown categories", () => {
    const categories = extractCategoriesJson(JSON.stringify({
      categories: [
        { id: "coding", confidence: 0.94, evidence: "README 提到代码审查与测试" },
        { id: "automation", confidence: 0.81, evidence: "支持自动化工作流" },
        { id: "made-up", confidence: 1, evidence: "不存在的分类" },
      ],
    }));
    expect(categories.map(({ id }) => id)).toEqual(["coding", "automation"]);
  });

  it("uses Chinese source text or a conservative fallback", () => {
    expect(fallbackDescriptionZh("用于管理插件的中文工具")).toBe("用于管理插件的中文工具");
    expect(fallbackDescriptionZh("An English-only plugin")).toContain("DeepSeek Harness");
  });
});
