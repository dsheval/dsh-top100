import { describe, expect, it } from "vitest";
import reviewed from "../src/shared/reviewed-descriptions.json";
import { descriptionFor, matchesReviewedReadme } from "../src/shared/description-rules.js";
import { withReviewedDescription } from "../src/shared/descriptions.js";
import { filterCatalog } from "../src/host/catalog.js";
import { recommendationResult } from "../src/host/recommendations.js";
import type { RankingEntry, RankingsDocument } from "../src/shared/types.js";

function sample(fullName: keyof typeof reviewed = "nexu-io/open-design"): RankingEntry {
  const review = reviewed[fullName];
  const [owner, name] = fullName.split("/");
  return {
    fullName, name, owner, rank: 1,
    description: review.sourceDescription, readmeSummary: review.sourceReadme,
    ...("sourceInstall" in review ? { install: { method: "pnpm-profile" as const, needsConfig: false,
      packageName: review.sourceInstall.packageName ?? undefined, repositoryPath: review.sourceInstall.repositoryPath ?? undefined,
      ...("functionEvidence" in review.sourceInstall ? { discovery: { status: "verified" as const, kind: "bundle" as const,
        checkedAt: "2026-09-11T00:00:00Z", policyVersion: 6, sourceRevision: "fixture",
        evidence: [`reviewed-function-sha256:${review.sourceInstall.functionEvidence}`] } } : {}) } } : {}),
    descriptionZh: "现有项目资料不足以生成可靠的功能简介。",
    stars: 100, dailyStars: 1, weeklyStars: 7, hotScore: 90, forks: 0, openIssues: 0,
    language: null, homepage: null, license: null, topics: [], tags: [],
    type: "sourceType" in review ? review.sourceType : "cordis-plugin", sources: [], url: `https://github.com/${fullName}`,
    pushedAt: "", createdAt: "", updatedAt: "",
  };
}
function document(entry: RankingEntry, snapshotId?: string): RankingsDocument {
  return { schemaVersion: 2, snapshotId, generatedAt: "2026-09-04T06:02:14.458Z", snapshotDate: "2026-09-04",
    rankings: { total: [entry], hot: [entry], rising: [entry] } };
}
const options = { view: "total" as const, category: null, query: "协议桥接", offset: 0, limit: 10, installed: {} };

describe("shared editorial descriptions", () => {
  it("ignores only a leading bilingual navigation switch in reviewed sources", () => {
    const body = "--- I spent a long time settling into focused writing in Typora.";
    expect(matchesReviewedReadme(body, `中文 | English ${body}`)).toBe(true);
    expect(matchesReviewedReadme(`English | 中文 ${body}`, body)).toBe(true);
    for (const changed of ["", `${body} New behavior.`, body.replace("writing", "coding"), `Other | English ${body}`]) {
      expect(matchesReviewedReadme(changed, `中文 | English ${body}`)).toBe(false);
    }
    expect(matchesReviewedReadme("3,000 endpoints", "2,896 endpoints")).toBe(false);
    expect(matchesReviewedReadme("version 0.2.0", "version 0.1.14")).toBe(false);
    const entry = sample();
    const expected = descriptionFor(entry, reviewed);
    expect(descriptionFor({ ...entry, readmeSummary: `中文 | English ${entry.readmeSummary}` }, reviewed)).toBe(expected);
    expect(descriptionFor({ ...entry, readmeSummary: `中文 | English ${entry.readmeSummary}`, install: { packageName: "different" } }, reviewed)).not.toBe(expected);
  });

  it("applies every source-bound summary and preserves the evidence", () => {
    expect(Object.keys(reviewed).length).toBeGreaterThan(0);
    for (const [fullName, review] of Object.entries(reviewed)) {
      const entry = sample(fullName as keyof typeof reviewed);
      const result = withReviewedDescription(entry);
      expect(result.descriptionZh, fullName).toBe(review.descriptionZh);
      expect(result.description).toBe(entry.description);
      expect(result.readmeSummary).toBe(entry.readmeSummary);
      expect(entry.descriptionZh).toContain("资料不足");
    }
  });

  it("binds manual summaries to package, subdirectory and type for full and compact entries", () => {
    const entry = { fullName: "fixture/panel", description: "A panel", readmeSummary: "Read project history.", type: "cordis-plugin",
      install: { packageName: "@fixture/panel", repositoryPath: "packages/panel" } };
    const review = { sourceDescription: entry.description, sourceReadme: entry.readmeSummary,
      sourceInstall: entry.install, sourceType: entry.type, descriptionZh: "在面板中查看项目历史与变更记录。", snapshotId: "reviewed-snapshot" };
    const reviews = { [entry.fullName]: review };
    const compact = { fullName: entry.fullName, description: entry.description, type: entry.type,
      installPackageName: entry.install.packageName, installRepositoryPath: entry.install.repositoryPath };
    const context = { snapshotId: review.snapshotId };
    expect(descriptionFor(entry, reviews)).toBe(review.descriptionZh);
    expect(descriptionFor({ ...compact, readmeSummary: entry.readmeSummary }, reviews)).toBe(review.descriptionZh);
    expect(descriptionFor(compact, reviews, context)).toBe(review.descriptionZh);
    for (const changed of [
      { ...entry, install: { ...entry.install, packageName: "@fixture/other" } },
      { ...entry, install: { ...entry.install, repositoryPath: "packages/other" } },
      { ...entry, install: undefined },
      { ...entry, type: "skill" },
      { ...compact, installPackageName: "@fixture/other" },
      { ...compact, installRepositoryPath: "packages/other" },
      { ...compact, type: "skill" },
    ]) expect(descriptionFor(changed, reviews, context)).not.toBe(review.descriptionZh);
  });

  it("keeps legacy summaries only for entries without a package identity", () => {
    const entry = { fullName: "fixture/legacy", description: "A legacy project", readmeSummary: "Read project history." };
    const review = { sourceDescription: entry.description, sourceReadme: entry.readmeSummary,
      descriptionZh: "查看项目历史与变更记录，辅助理解当前工作。" };
    const reviews = { [entry.fullName]: review };
    expect(descriptionFor(entry, reviews)).toBe(review.descriptionZh);
    for (const changed of [
      { ...entry, install: { packageName: "new-package" } },
      { ...entry, install: { repositoryPath: "packages/new" } },
      { ...entry, installPackageName: "new-package" },
      { ...entry, installRepositoryPath: "packages/new" },
    ]) expect(descriptionFor(changed, reviews)).not.toBe(review.descriptionZh);
  });

  it("accepts compact entries only for the exact reviewed snapshot", () => {
    const entry = { fullName: "fixture/browser", description: "Browser automation", descriptionZh: "资料不足" };
    const review = { sourceDescription: entry.description, sourceReadme: "Browse pages and fill forms.",
      descriptionZh: "连接浏览器读取页面和填写表单，辅助完成网页操作任务。", snapshotId: "fixture-reviewed-snapshot" };
    const reviews = { [entry.fullName]: review };
    expect(descriptionFor(entry, reviews, { snapshotId: review.snapshotId })).toBe(review.descriptionZh);
    expect(descriptionFor(entry, reviews)).not.toBe(review.descriptionZh);
    expect(descriptionFor(entry, reviews, { snapshotId: "new-snapshot" })).not.toBe(review.descriptionZh);
    expect(descriptionFor({ ...entry, readmeSummary: "Changed behavior" }, reviews, { snapshotId: review.snapshotId })).not.toBe(review.descriptionZh);
    expect(descriptionFor({ ...entry, description: "Changed project" }, reviews, { snapshotId: review.snapshotId })).not.toBe(review.descriptionZh);
  });

  it("searches and returns the same reviewed text in lists and Agent recommendations", () => {
    const entry = sample();
    const expected = reviewed[entry.fullName as keyof typeof reviewed].descriptionZh;
    for (const view of ["hot", "rising", "total"] as const) {
      expect(filterCatalog(document(entry), { ...options, view }).items[0].descriptionZh).toBe(expected);
    }
    expect(recommendationResult(document(entry), { query: options.query }).items[0].description).toBe(expected);
    expect(entry.descriptionZh).toContain("资料不足");
  });

  it("uses an unchanged historical review for compact Agent recommendations", () => {
    const historical = Object.entries(reviewed).find(([, review]) => "snapshotId" in review && Boolean(review.snapshotId));
    expect(historical).toBeDefined();
    const [fullName, review] = historical!;
    const entry = sample(fullName as keyof typeof reviewed);
    delete entry.readmeSummary;
    const compact = document(entry, "snapshotId" in review ? review.snapshotId : undefined);
    expect(recommendationResult(compact, { query: fullName }).items[0].description).toBe(review.descriptionZh);
    expect(entry.descriptionZh).toContain("资料不足");
  });

  it("does not attach a current review to an older compact snapshot", () => {
    const entry = sample();
    const review = reviewed["nexu-io/open-design"];
    expect(review).not.toHaveProperty("snapshotId");
    delete entry.readmeSummary;
    expect(withReviewedDescription(entry, { snapshotId: "2026-09-04-5de5fae7706f47b1" }).descriptionZh).not.toBe(review.descriptionZh);
  });

  it("applies the same presentation to the separate Skills directory", () => {
    const skill = Object.entries(reviewed).find(([, review]) => "sourceType" in review && review.sourceType === "skill");
    expect(skill).toBeDefined();
    const [fullName, review] = skill!;
    const entry = sample(fullName as keyof typeof reviewed);
    expect(filterCatalog(document(entry), { ...options, query: fullName, catalogScope: "skills" }).items[0].descriptionZh).toBe(review.descriptionZh);
    expect(filterCatalog(document(entry), { ...options, query: fullName, catalogScope: "plugins" }).items).toHaveLength(0);
  });

  it("removes placeholder and markup fragments without inventing capabilities", () => {
    expect(descriptionFor({ descriptionZh: "资料不足", description: "<script>secret()</script>**Browser** [tools](https://example.org)" })).toBe("中文简介待生成。");
    expect(descriptionFor({ descriptionZh: "求 Star", description: "" })).toBe("中文简介待生成。");
    expect(descriptionFor({ description: "**搜索网页**并整理资料。" })).toBe("搜索网页 并整理资料。");
  });

  it("rejects English and mostly English summaries while preserving product names", () => {
    for (const descriptionZh of [
      "Browser automation for agents.",
      "中文简介：The browser automation toolkit for agents with persistent sessions.",
      "用于自动化：The browser automation toolkit for agents with persistent sessions.",
    ]) {
      expect(descriptionFor({ descriptionZh, description: "Browser automation for agents." })).toBe("中文简介待生成。");
    }
    const chinese = "让 DeepSeek Harness 调用 Browser Skill 操作网页。";
    expect(descriptionFor({ descriptionZh: chinese })).toBe(chinese);
    expect(descriptionFor({ descriptionZh: "Browser tools", description: "搜索网页并整理资料。" })).toBe("搜索网页并整理资料。");
  });

  it("validates even source-bound reviews before using them as Chinese summaries", () => {
    const entry = { fullName: "owner/tool", description: "English source", readmeSummary: "README" };
    const reviews = { "owner/tool": { sourceDescription: entry.description, sourceReadme: entry.readmeSummary, descriptionZh: "English review" } };
    expect(descriptionFor(entry, reviews)).toBe("中文简介待生成。");
  });
});

it("does not display the root Chinese description for an undocumented subpackage", () => {
  const root = { description: "自动生成研究报告并管理企业知识库。", descriptionZh: "中文简介待生成。" };
  expect(descriptionFor({ ...root, install: { repositoryPath: "packages/bridge" } })).toBe("中文简介待生成。");
  expect(descriptionFor({ ...root, installRepositoryPath: "packages/bridge" })).toBe("中文简介待生成。");
  expect(descriptionFor(root)).toBe("中文简介待生成。");
  expect(descriptionFor({ description: root.description })).toBe(root.description);
});


it("preserves an explicit pending summary in every current withdrawn compact entry", () => {
  const withdrawn = Object.entries(reviewed).filter(([, review]) => "suspended" in review && review.suspended);
  expect(withdrawn.map(([id]) => id)).toEqual(expect.arrayContaining([
    "whitelonng/dshcode", "fufankeji/deepseek-harness-studio", "op7418/pilot-harness", "zuorn/tydora",
  ]));
  for (const [fullName] of withdrawn) {
    const entry = sample(fullName as keyof typeof reviewed);
    const pending = withReviewedDescription(entry);
    expect(pending.descriptionZh).toBe("中文简介待生成。");
    const compact = { ...pending };
    delete compact.readmeSummary;
    // Unavailable install targets can also omit the package identity in old indexes.
    for (const item of [compact, { ...compact, install: undefined }]) {
      expect(descriptionFor(item, reviewed, { snapshotId: "new-data-snapshot" }), fullName).toBe("中文简介待生成。");
      expect(descriptionFor(item), fullName).toBe("中文简介待生成。");
      expect(filterCatalog(document(item), { ...options, query: "" }).items[0].descriptionZh, fullName).toBe("中文简介待生成。");
    }
  }
});

it("does not apply the reviewed DeepSeekGUI workbench capabilities to its withdrawn workspace root", () => {
  const entry = sample("see-sol-lab/deepseekgui");
  expect(descriptionFor(entry, reviewed)).toBe(reviewed["see-sol-lab/deepseekgui"].descriptionZh);
  expect(descriptionFor({ ...entry, install: { packageName: "@deepseek-ai/dsh-root" }, descriptionZh: "中文简介待生成。" }, reviewed)).toBe("中文简介待生成。");
});

it("keeps pending markup normalized and permits a fresh fully bound review to replace it", () => {
  const entry = sample();
  expect(descriptionFor({ descriptionZh: " **中文简介待生成。** ", description: "自动生成研究报告并管理企业知识库。" })).toBe("中文简介待生成。");
  expect(withReviewedDescription({ ...entry, descriptionZh: "中文简介待生成。" }).descriptionZh).toBe(reviewed["nexu-io/open-design"].descriptionZh);
});

it("does not claim an unbound old compact cache can recognize a new withdrawal", () => {
  const full = sample("fufankeji/deepseek-harness-studio");
  full.descriptionZh = "提供桌面界面和插件管理，方便使用智能助手。";
  expect(withReviewedDescription(full).descriptionZh).toBe("中文简介待生成。");
  const compact = { ...full };
  delete compact.readmeSummary;
  // The old snapshot still needs a data refresh; guessing its missing README
  // would also weaken the identity checks for positive editorial reviews.
  expect(withReviewedDescription(compact, { snapshotId: "old-cache" }).descriptionZh).toBe(full.descriptionZh);
});
