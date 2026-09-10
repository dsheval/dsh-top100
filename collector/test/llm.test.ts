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

  it("accepts descriptions over 60 total characters when Chinese stays within 60 and preserves brand spacing", () => {
    const descriptionZh = "为 DeepSeek Harness 提供代码审查工具，帮助整理文件变更及检查测试结果并详细记录问题，方便开发者及时逐项核对和处理。";
    expect([...descriptionZh]).toHaveLength(66);
    expect(descriptionZh.match(/[\u4e00-\u9fff]/g)).toHaveLength(45);
    expect(extractJson(JSON.stringify({ descriptionZh, tagsZh: ["代码审查"] })))
      .toEqual({ descriptionZh, tagsZh: ["代码审查"] });
    // Existing reviewed description for ayase34/gal-view includes two spaced product names.
    const reviewed = "把 DeepSeek Harness 会话界面变成 Galgame 游戏视窗，支持立绘、对话框和场景编辑，让聊天更有代入感。";
    expect([...reviewed].length).toBeGreaterThan(60);
    expect(extractJson(JSON.stringify({ descriptionZh: reviewed }))?.descriptionZh).toBe(reviewed);
  });

  it("accepts exactly 60 Chinese characters and rejects 61 even below the total character limit", () => {
    const descriptionZh = "提供代码审查工具，帮助开发者检查文件变更和测试结果，按照问题类型整理修复建议，并记录每次审查发现的问题，方便团队成员核对项目修改。";
    expect(descriptionZh.match(/[\u4e00-\u9fff]/g)).toHaveLength(60);
    expect(extractJson(JSON.stringify({ descriptionZh }))?.descriptionZh).toBe(descriptionZh);
    const tooManyChinese = descriptionZh.replace("核对项目", "核对该项目");
    expect(tooManyChinese.match(/[\u4e00-\u9fff]/g)).toHaveLength(61);
    expect([...tooManyChinese].length).toBeLessThan(160);
    expect(extractJson(JSON.stringify({ descriptionZh: tooManyChinese }))).toBeNull();
  });

  it("enforces the independent 160-character total limit for summaries containing long product names", () => {
    const base = "为 DeepSeek Harness 提供代码审查工具，帮助整理文件变更及检查测试结果并详细记录问题，方便开发者及时逐项核对和处理。";
    // Artificial name padding isolates the total-length limit without increasing the Chinese count.
    const exactLimit = base.replace("DeepSeek Harness", `DeepSeek Harness ${"A".repeat(93)}`);
    expect([...exactLimit]).toHaveLength(160);
    expect(exactLimit.match(/[\u4e00-\u9fff]/g)).toHaveLength(45);
    expect(extractJson(JSON.stringify({ descriptionZh: exactLimit }))?.descriptionZh).toBe(exactLimit);
    const overLimit = exactLimit.replace("DeepSeek Harness", "DeepSeek HarnessA");
    expect([...overLimit]).toHaveLength(161);
    expect(overLimit.match(/[\u4e00-\u9fff]/g)).toHaveLength(45);
    expect(extractJson(JSON.stringify({ descriptionZh: overLimit }))).toBeNull();
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
    expect(categories.map(({ id }) => id)).toEqual(["coding", "tools"]);
  });

  it("uses Chinese source text or a conservative fallback", () => {
    expect(fallbackDescriptionZh("用于管理插件的中文工具")).toBe("用于管理插件的中文工具");
    expect(fallbackDescriptionZh("An English-only plugin", "demo-plugin")).toBe("中文简介待生成。");
    expect(fallbackDescriptionZh("Desktop client", "dsh-desktop")).toBe("中文简介待生成。");
  });

  it("builds a repository-specific fallback from README and leaves it retryable", () => {
    const fallback = fallbackDescriptionZh({
      name: "ruflo",
      description: "",
      readmeSummary: "Enterprise multi-agent orchestration with hierarchical swarms and coordinated workflows.",
      topics: ["multi-agent", "orchestration"],
    });
    expect(fallback).toBe("中文简介待生成。");
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
      "中文简介待生成。",
      "中文简介：Browser automation for agents with persistent sessions.",
      "用于自动化：Browser automation for agents with persistent sessions.",
    ]) {
      expect(isGenericDescriptionZh(summary)).toBe(true);
      expect(extractJson(JSON.stringify({ descriptionZh: summary, tagsZh: [] }))).toBeNull();
    }
  });

  it("does not infer search or security capabilities from incidental keywords", () => {
    const summary = fallbackDescriptionZh({ name: "BrowserSkill", description: "Let AI agents use your logged-in browser.", readmeSummary: null, topics: ["browser", "security"] });
    expect(summary).not.toMatch(/知识检索|安全检查|无需/);
    expect(summary).toBe("中文简介待生成。");
  });

  it("does not mistake an English source with a Chinese prefix for a translation", () => {
    expect(fallbackDescriptionZh("用于自动化：Browser automation for agents with persistent sessions.")).toBe("中文简介待生成。");
    expect(fallbackDescriptionZh("版本更新提示：本次版本变化较大，老用户请更新至最新版本。")).toBe("中文简介待生成。");
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
        requestMode: "offline-test",
        offlineTransport: fetchMock,
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

// Selected package summaries must not borrow the parent product's capabilities.
it("does not use a Chinese root description as a subpackage fallback", () => {
  expect(fallbackDescriptionZh({ name: "bridge", description: "自动生成研究报告并管理企业知识库。", readmeSummary: null, topics: [], install: { repositoryPath: "packages/bridge" } })).toBe("中文简介待生成。");
  expect(fallbackDescriptionZh({ name: "bridge", description: "自动生成研究报告并管理企业知识库。", readmeSummary: "在编辑器中展示项目文件与变更记录。", topics: [], install: { repositoryPath: "packages/bridge" } })).toBe("在编辑器中展示项目文件与变更记录。");
});
