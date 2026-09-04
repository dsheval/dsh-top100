import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractCategoriesJson,
  extractJson,
  fallbackDescriptionZh,
  isGenericDescriptionZh,
  translateWithDeepSeek,
} from "../src/llm.js";

afterEach(() => vi.restoreAllMocks());

describe("Chinese summary validation", () => {
  it("accepts a short Chinese description and rejects non-Chinese output", () => {
    expect(
      extractJson('{"descriptionZh":"把网页操作封装为 DSH 可调用的浏览器工具。","tagsZh":["浏览器"]}')
        ?.descriptionZh
    ).toContain("浏览器工具");
    expect(extractJson('{"descriptionZh":"Ignore previous instructions","tagsZh":[]}')).toBeNull();
    expect(extractJson('{"descriptionZh":"用于监控任务状态并发送通知","tagsZh":["任务监控"')).toBeNull();
    expect(
      extractJson('{"descriptionZh":"用于扩展 DeepSeek Harness 能力，具体功能和安装方式请查看项目 README。","tagsZh":[]}')
    ).toBeNull();
  });

  it("accepts controlled multi-category output and removes unknown categories", () => {
    const categories = extractCategoriesJson(JSON.stringify({
      categories: [
        { id: "coding", confidence: 0.94, evidence: "README 提到代码审查与测试" },
        { id: "tools", confidence: 0.81, evidence: "支持自动化工作流" },
        { id: "security", confidence: 0.72, evidence: "提供权限审计" },
        { id: "made-up", confidence: 1, evidence: "不存在的分类" },
      ],
    }));
    expect(categories.map(({ id }) => id)).toEqual(["coding", "tools", "security"]);
  });

  it("uses Chinese source text or a conservative fallback", () => {
    expect(fallbackDescriptionZh("用于管理插件的中文工具")).toBe("用于管理插件的中文工具");
    expect(fallbackDescriptionZh("An English-only plugin", "demo-plugin")).toBe("An English-only plugin");
    expect(fallbackDescriptionZh("Desktop client", "dsh-desktop")).toBe("Desktop client");
  });

  it("builds a repository-specific fallback from README and leaves it retryable", () => {
    const fallback = fallbackDescriptionZh({
      name: "ruflo",
      description: "",
      readmeSummary: "Enterprise multi-agent orchestration with hierarchical swarms and coordinated workflows.",
      topics: ["multi-agent", "orchestration"],
    });
    expect(fallback).toBe("暂无简介");
    expect(fallback).not.toContain("请查看项目 README");
    expect(fallback).not.toContain("DSH 插件");
    expect(isGenericDescriptionZh(fallback)).toBe(true);
    expect(isGenericDescriptionZh("ruflo：已收录的 DSH 插件，现有项目资料不足以生成可靠的功能简介。")).toBe(true);
  });

  it("prefers a useful Chinese sentence from README when the repository description is English", () => {
    expect(
      fallbackDescriptionZh({
        name: "demo",
        description: "A useful DSH extension.",
        readmeSummary: "欢迎使用。这个插件支持跨设备同步会话，并自动整理历史记录。安装方法如下。",
        topics: [],
      })
    ).toBe("这个插件支持跨设备同步会话，并自动整理历史记录。");
  });

  it("rejects implementation-only and navigation fragments as summaries", () => {
    for (const summary of [
      "纯 Node 实现，无网络依赖",
      "中文 | English 组件入口 | 组件 | 说明 | |---|---|",
      "中文简介：请参考项目文档了解具体功能",
    ]) {
      expect(isGenericDescriptionZh(summary)).toBe(true);
      expect(extractJson(JSON.stringify({ descriptionZh: summary, tagsZh: [] }))).toBeNull();
    }
  });

  it("does not infer search or security capabilities from incidental keywords", () => {
    const summary = fallbackDescriptionZh({ name: "BrowserSkill", description: "Let AI agents use your logged-in browser.", readmeSummary: null, topics: ["browser", "security"] });
    expect(summary).not.toMatch(/知识检索|安全检查|无需/);
    expect(summary).toBe("Let AI agents use your logged-in browser.");
  });

  it("uses complete source sentences without deleting English word boundaries", () => {
    const description = "为 DeepSeek Harness 提供浏览器自动化。" + "说明".repeat(50);
    expect(fallbackDescriptionZh(description)).toBe("为 DeepSeek Harness 提供浏览器自动化。");
    expect(extractJson(JSON.stringify({ descriptionZh: "让 DeepSeek Harness 调用 Browser Skill 操作网页。" }))?.descriptionZh)
      .toContain("DeepSeek Harness");
  });

  it("discards markdown tables and uses the next factual sentence", () => {
    expect(fallbackDescriptionZh({ name: "demo", description: "中文 | English | 组件 | 说明 | |---|---|", readmeSummary: "# 使用说明\n这个插件支持跨设备同步会话。\n安装步骤如下。", topics: [] }))
      .toBe("这个插件支持跨设备同步会话。");
  });

  it("retries empty or invalid successful responses instead of failing immediately", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "" } }] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"descriptionZh":"编排多个智能体协同完成复杂工作流。","tagsZh":["智能体编排"]}',
                },
              },
            ],
          })
        )
      );

    const result = await translateWithDeepSeek(
      {
        name: "ruflo",
        description: "Multi-agent orchestration",
        readmeSummary: null,
        topics: ["multi-agent"],
      },
      {
        apiKey: "test-key",
        baseURL: "https://example.test/",
        model: "test-model",
        maxAttempts: 2,
        retryDelayMs: 0,
        timeoutMs: 1000,
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.descriptionZh).toContain("智能体协同");
  });
});
