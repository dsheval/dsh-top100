import { describe, expect, it } from "vitest";
import { toSearchEntry, toSnapshotSearchEntry } from "../src/search-index.js";
import reviews from "../config/reviewed-descriptions.json";
import { publishedDescriptionZh } from "../src/published-description.js";
import { descriptionFor, PENDING_DESCRIPTION_ZH } from "../src/description-rules.js";
import type { RankingEntry } from "../src/rankings.js";

function entry(): RankingEntry {
  return { fullName: "fixture/repo", name: "demo", type: "cordis-plugin", rank: 1,
    description: "在会话中浏览文件树并预览文本内容。", descriptionZh: "在会话中浏览文件树并预览文本内容。",
    readmeSummary: "The demo package provides a file tree and read-only text previews.", categories: [], tags: [],
    install: { method: "pnpm-profile", packageName: "demo", repositoryPath: "packages/demo" },
  } as unknown as RankingEntry;
}
describe("published Chinese identity", () => {
  it("keeps explicit Chinese through compact export even when identical to original text", () => {
    const source = entry();
    for (const compact of [toSearchEntry(source), toSnapshotSearchEntry(source)]) {
      expect(compact.descriptionZh).toBe(source.descriptionZh);
      expect(descriptionFor(compact)).toBe(source.descriptionZh);
    }
  });
  it("does not restore root product prose for a held subpackage", () => {
    const source = entry();
    source.install.packageName = "@deepseek-ai/dsh-root";
    expect(publishedDescriptionZh(source)).toBe(PENDING_DESCRIPTION_ZH);
    expect(descriptionFor(toSnapshotSearchEntry(source))).toBe(PENDING_DESCRIPTION_ZH);
  });
  it("keeps a missing subpackage description pending instead of using root prose", () => {
    const source = entry();
    source.descriptionZh = "";
    expect(descriptionFor(toSnapshotSearchEntry(source))).toBe(PENDING_DESCRIPTION_ZH);
  });
});

it('the server alone rejects semantic failures and authoritative missing statuses', () => {
  for (const text of ['', '感谢官方对本项目的肯定与支持！', '安装后会提供九个可单独调用的入口：…']) {
    expect(publishedDescriptionZh({...entry(),descriptionZh:text})).toBe(PENDING_DESCRIPTION_ZH);
  }
  expect(publishedDescriptionZh({...entry(),descriptionStatus:{state:'review-required',reason:'源已撤回'}})).toBe(PENDING_DESCRIPTION_ZH);
});


it.each(['readme', 'package', 'directory', 'type'] as const)('does not stamp a stale legacy review as server-final after %s changes', change => {
  const fullName = 'meteornox/deepseek-balance-whale-widget';
  const review = reviews[fullName];
  const source = { ...entry(), fullName, description: review.sourceDescription,
    descriptionZh: review.descriptionZh, readmeSummary: review.sourceReadme,
    type: review.sourceType, install: { method: 'pnpm-profile' as const,
      packageName: review.sourceInstall.packageName } } as RankingEntry;
  expect(publishedDescriptionZh(source)).toBe(review.descriptionZh);
  if (change === 'readme') source.readmeSummary += ' Changed functionality, not reviewed.';
  if (change === 'package') source.install.packageName = '@fixture/other';
  if (change === 'directory') source.install.repositoryPath = 'packages/other';
  if (change === 'type') source.type = 'skill';
  expect(publishedDescriptionZh(source)).toBe(PENDING_DESCRIPTION_ZH);
  for (const compact of [toSearchEntry(source), toSnapshotSearchEntry(source)]) {
    expect(compact.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
  }
});
