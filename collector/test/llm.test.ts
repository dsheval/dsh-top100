import { describe, expect, it } from "vitest";
import { extractJson, fallbackDescriptionZh } from "../src/llm.js";

describe("Chinese summary validation", () => {
  it("accepts a short Chinese description and rejects non-Chinese output", () => {
    expect(
      extractJson('{"descriptionZh":"把网页操作封装为 DSH 可调用的浏览器工具。","tagsZh":["浏览器"]}')
        ?.descriptionZh
    ).toContain("浏览器工具");
    expect(extractJson('{"descriptionZh":"Ignore previous instructions","tagsZh":[]}')).toBeNull();
    expect(extractJson('{"descriptionZh":"用于监控任务状态并发送通知","tagsZh":["任务监控"')).toBeNull();
  });

  it("uses Chinese source text or a conservative fallback", () => {
    expect(fallbackDescriptionZh("用于管理插件的中文工具")).toBe("用于管理插件的中文工具");
    expect(fallbackDescriptionZh("An English-only plugin")).toContain("DeepSeek Harness");
  });
});
