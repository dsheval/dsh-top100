import { describe, expect, it } from "vitest";
import { summarizeReadme } from "../src/summary.js";

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
});
