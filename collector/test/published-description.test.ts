import { describe, expect, it } from "vitest";
import { toSearchEntry, toSnapshotSearchEntry } from "../src/search-index.js";
import { publishedDescriptionZh } from "../src/published-description.js";
import { descriptionFor, PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";
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
