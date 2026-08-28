import { describe, expect, it } from "vitest";
import { zh } from "../src/client/locales.js";
import { managedDescriptionZh, resolveUpdateTarget } from "../src/host/manage.js";

describe("managed plugin updates", () => {
  it("resolves npm and GitHub update targets", () => {
    expect(resolveUpdateTarget("sample-plugin", "^1.0.0")).toBe("sample-plugin@latest");
    expect(resolveUpdateTarget("sample-plugin", "github:owner/repo#main")).toBe("github:owner/repo");
  });

  it("does not overwrite local source links", () => {
    expect(resolveUpdateTarget("sample-plugin", "link:/tmp/sample")).toBeNull();
    expect(resolveUpdateTarget("sample-plugin", "file:../sample")).toBeNull();
  });
});

describe("managed plugin Chinese summaries", () => {
  it("prefers an explicit Chinese catalog description", () => {
    expect(managedDescriptionZh({
      kind: "bundle",
      name: "example-plugin",
      descriptionZh: "用于整理知识库的插件",
      descriptions: ["Knowledge base organizer"],
    })).toBe("用于整理知识库的插件");
  });

  it("exposes Chinese management titles, states, kinds, and actions", () => {
    expect(zh.installedManagerTitle).toBe("已安装插件管理");
    expect(zh.enabled).toBe("已启用");
    expect(zh.disabled).toBe("已停用");
    expect(zh.bundleKind).toContain("插件");
    expect(zh.skillKind).toContain("技能");
    expect([zh.enable, zh.disable, zh.update, zh.uninstall]).toEqual(["启用", "停用", "更新", "卸载"]);
  });

  it("keeps author-supplied Chinese text when descriptionZh is absent", () => {
    expect(managedDescriptionZh({
      kind: "skill",
      name: "daily-report",
      descriptions: ["生成每日项目简报"],
    })).toBe("生成每日项目简报");
  });

  it("uses an honest Chinese inventory fallback instead of translating English", () => {
    expect(managedDescriptionZh({
      kind: "bundle",
      name: "acme-search",
      descriptions: ["Search across private documents"],
    })).toBe("已安装的 DSH 插件：acme-search。暂无中文简介。");
    expect(managedDescriptionZh({
      kind: "skill",
      name: "daily-report",
      descriptions: [],
    })).toBe("已安装的本地技能（Skill）：daily-report。暂无中文简介。");
  });
});
