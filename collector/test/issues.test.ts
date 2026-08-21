import { describe, expect, it } from "vitest";
import { extractRepoFromText, extractIntroByAuthor } from "../src/sources/issues.js";

describe("extractRepoFromText", () => {
  it("从 issue 正文提取仓库地址", () => {
    const text = "仓库：https://github.com/foo/bar 请收录";
    expect(extractRepoFromText(text)).toEqual(["foo/bar"]);
  });

  it("兼容多种 URL 后缀（tree/blob/issues/.git）", () => {
    expect(
      extractRepoFromText("https://github.com/a/b/tree/main x https://github.com/c/d/issues/1 https://github.com/e/f.git")
    ).toEqual(["a/b", "c/d", "e/f"]);
  });

  it("过滤非仓库路径（github.com 自身/本仓库/issues 等）", () => {
    const text = "https://github.com/settings https://github.com/github/foo https://github.com/2BingLing/dsh-market https://github.com/x/issues";
    expect(extractRepoFromText(text)).toEqual([]);
  });

  it("过滤 GitHub 附件域（user-attachments 图片路径不是仓库）", () => {
    const text = "截图：https://github.com/user-attachments/assets/123abc 仓库：https://github.com/foo/bar";
    expect(extractRepoFromText(text)).toEqual(["foo/bar"]);
  });

  it("大小写归一化", () => {
    expect(extractRepoFromText("https://github.com/MyOrg/MyRepo")).toEqual(["myorg/myrepo"]);
  });

  it("去重", () => {
    expect(
      extractRepoFromText("https://github.com/a/b 和 https://github.com/A/B")
    ).toEqual(["a/b"]);
  });

  it("无仓库地址返回空", () => {
    expect(extractRepoFromText("这是一个普通 issue")).toEqual([]);
  });
});

describe("extractIntroByAuthor", () => {
  it("提取模板字段（markdown 加粗：**作者自述简介**：…）", () => {
    const body = "- **作者自述简介**：用我自己的话介绍这个插件，解决日常痛点。";
    expect(extractIntroByAuthor(body)).toBe("用我自己的话介绍这个插件，解决日常痛点。");
  });

  it("兼容裸写法（作者自述：…）", () => {
    expect(extractIntroByAuthor("作者自述：一句话介绍我的插件")).toBe("一句话介绍我的插件");
  });

  it("兼容自定义简介写法", () => {
    expect(extractIntroByAuthor("自定义简介: 这是自述内容")).toBe("这是自述内容");
  });

  it("无作者自述返回 undefined", () => {
    expect(extractIntroByAuthor("- **一句话简介**：普通描述")).toBeUndefined();
    expect(extractIntroByAuthor(null)).toBeUndefined();
  });

  it("只取第一行", () => {
    expect(extractIntroByAuthor("作者自述：第一行\n第二行")).toBe("第一行");
  });

  it("方括号形式支持多行（跨行取方括号内全部内容）", () => {
    const body =
      "- **作者自述简介**：[这是我的第一行介绍，\n  第二行补充说明，\n  还有第三行。]\n- 其他字段";
    const got = extractIntroByAuthor(body);
    expect(got).toContain("这是");
    expect(got).toContain("第三行");
  });

  it("模板推荐写法（作者自述简介：[…]）", () => {
    const body = "- **作者自述简介**：[这是用我自己话写的介绍。]";
    expect(extractIntroByAuthor(body)).toBe("这是用我自己话写的介绍。");
  });

  it("方括号为空回退裸写法", () => {
    expect(extractIntroByAuthor("作者自述：[] 实际在另一行")).toBe("[] 实际在另一行");
  });
});
