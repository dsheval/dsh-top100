import { describe, expect, it } from "vitest";
import { summarizeReadme, summarizeReviewedReadme } from "../src/summary.js";

describe("README excerpt cleanup", () => {
  it("removes headings, badges, tables, code and scripts but retains link text", () => {
    const readme = '# Title\n![badge](https://example.test/a.svg)\n```sh\necho demo\n```\n| Name | Value |\n| --- | --- |\n<script>alert(1)</script>\n**在 DSH 中管理书签**，支持[导入书签](https://example.test)。';
    expect(summarizeReadme(readme)).toBe("在 DSH 中管理书签，支持导入书签。");
  });
  it("keeps English words separated and bounds long excerpts", () => {
    expect(summarizeReadme("Browser automation with Playwright.")).toBe("Browser automation with Playwright.");
    const excerpt = summarizeReadme("可在对话中使用浏览器。".repeat(100));
    expect(excerpt.length).toBeLessThanOrEqual(421);
    expect(excerpt).toMatch(/。…$/);
  });

  it("normalizes scoped language navigation before its length can move the truncation boundary", () => {
    const body = "The browser bridge reads pages and operates controls through the active extension ".repeat(12);
    const plain = `# browser\n\n${body}`;
    const navigation = `# browser\n\nEnglish | [中文](README.zh.md)\n\n${body}`;
    const reversed = `# browser\n\n[中文](README.zh.md) | English\n\n${body}`;
    // Existing records and their hashes are unchanged until explicitly migrated.
    expect(summarizeReadme(navigation)).not.toBe(summarizeReadme(plain));
    expect(summarizeReadme(navigation).replace(/^English \| 中文 /, "")).not.toBe(summarizeReadme(plain));
    expect(summarizeReviewedReadme(navigation)).toBe(summarizeReviewedReadme(plain));
    expect(summarizeReviewedReadme(reversed)).toBe(summarizeReviewedReadme(plain));
    expect(summarizeReviewedReadme(navigation)).toHaveLength(421);
  });

  it("keeps functional changes and non-navigation language text distinct", () => {
    const original = "English | [中文](README.zh.md)\nReads pages with 60 numbered controls.";
    expect(summarizeReviewedReadme(original.replace("60", "40"))).not.toBe(summarizeReviewedReadme(original));
    expect(summarizeReviewedReadme(original.replace("Reads", "Writes"))).not.toBe(summarizeReviewedReadme(original));
    expect(summarizeReviewedReadme("Supports English | 中文 translation.")).toBe("Supports English | 中文 translation.");
    expect(summarizeReviewedReadme("Other | English browser tools")).toBe("Other | English browser tools");
    expect(summarizeReviewedReadme("Browser tools. English | 中文 support.")).toBe("Browser tools. English | 中文 support.");
  });
});
