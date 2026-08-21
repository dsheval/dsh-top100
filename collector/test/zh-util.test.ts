/**
 * zh-util 单元测试：摘要相似度 + 「变化量触发」重翻判定
 */
import { describe, it, expect } from "vitest";
import { summarySimilarity, shouldRetranslate, ZhEntry } from "../src/zh-util.js";

describe("summarySimilarity", () => {
  it("相同文本相似度为 1", () => {
    expect(summarySimilarity("hello world plugin", "hello world plugin")).toBe(1);
  });

  it("完全不同文本相似度低", () => {
    expect(summarySimilarity("abcd efgh ijkl", "wxyz qrst uvop")).toBeLessThan(0.2);
  });

  it("空输入返回 0", () => {
    expect(summarySimilarity("", "abc")).toBe(0);
    expect(summarySimilarity("abc", "")).toBe(0);
  });

  it("轻微改动相似度高（小改不触发重翻）", () => {
    const a = "这个插件可以把 DeepSeek Harness 的会话历史导入并管理，支持搜索和导出。";
    const b = "这个插件可以把 DeepSeek Harness 的会话历史导入并管理，支持搜索和导出文件。";
    expect(summarySimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("实质重写相似度低（大改触发重翻）", () => {
    const a = "管理 DeepSeek Harness 的会话历史，支持导入导出。";
    const b = "在设置面板中配置主题、字体与快捷键，支持多主题切换和自定义布局。";
    expect(summarySimilarity(a, b)).toBeLessThan(0.4);
  });
});

describe("shouldRetranslate", () => {
  it("README 实质大改 → 重翻", () => {
    expect(
      shouldRetranslate(
        "在设置面板中配置主题、字体与快捷键，支持多主题切换。",
        "管理 DeepSeek Harness 的会话历史，支持导入导出。"
      )
    ).toBe(true);
  });

  it("轻微改动 → 不重翻", () => {
    expect(
      shouldRetranslate(
        "管理 DeepSeek Harness 的会话历史，支持导入和导出文件。",
        "管理 DeepSeek Harness 的会话历史，支持导入导出。"
      )
    ).toBe(false);
  });

  it("当前无摘要 → 不重翻", () => {
    expect(shouldRetranslate(null, "some-key")).toBe(false);
  });

  it("无历史指纹（首次/旧缓存）→ 不重翻（避免首次把存量全翻）", () => {
    expect(shouldRetranslate("abc", undefined)).toBe(false);
    expect(shouldRetranslate("abc", "")).toBe(false);
  });

  it("类型兼容（ZhEntry 可含 summaryKey）", () => {
    const entry: ZhEntry = { descriptionZh: "x", tagsZh: ["a"], summaryKey: "k" };
    expect(entry.summaryKey).toBe("k");
  });
});
