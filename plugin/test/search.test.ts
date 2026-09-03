import { describe, expect, it } from "vitest";
import { createSearchScorer, scoreSearchEntry, tokenizeSearchQuery } from "../src/shared/search.js";
import type { RankingEntry } from "../src/shared/types.js";

const entry = (fields: Partial<RankingEntry>): RankingEntry => fields as RankingEntry;

describe("prepared catalog search", () => {
  it("preserves matching, synonyms, typos and multi-token coverage", () => {
    const rows = [
      entry({ fullName: "acme/browser", name: "browser", descriptionZh: "浏览器自动化", tags: ["web"] }),
      entry({ fullName: "acme/review", name: "code-review", descriptionZh: "代码审查与测试" }),
      entry({ fullName: "acme/memory", name: "memory", topics: ["knowledge"] }),
    ];
    for (const query of ["", "浏览器", "browesr", "代码审查", "我想找个知识库插件", "not-found"]) {
      const score = createSearchScorer(query);
      expect(rows.map(score)).toEqual(rows.map((row) => scoreSearchEntry(row, query)));
    }
    expect(createSearchScorer("浏览器")(rows[0])).toBeGreaterThan(0);
    expect(createSearchScorer("browesr")(rows[0])).toBeGreaterThan(0);
    expect(createSearchScorer("我想找个知识库插件")(rows[2])).toBeGreaterThan(0);
    expect(tokenizeSearchQuery("我想找个浏览器自动化插件")).toEqual(["浏览器", "自动化"]);
    expect(createSearchScorer("浏览器自动化")(entry({ name: "demo", description: "browser automation" }))).toBeGreaterThan(0);
    expect(createSearchScorer("not-found")(rows[0])).toBeNull();
  });

  it("gives compact and normalized host entries identical scores", () => {
    const compact = entry({ fullName: "acme/browser", name: "browser", description: "Browser automation", tags: [] });
    const host = entry({ ...compact, owner: "acme", descriptionZh: "", topics: [] });
    expect(createSearchScorer("acme")(compact)).toEqual(createSearchScorer("acme")(host));
  });

  it("invalidates prepared fields when an entry or its tags change", () => {
    const row = entry({ fullName: "acme/demo", name: "demo", tags: ["browser"] });
    const score = createSearchScorer("浏览器");
    expect(score(row)).toBeGreaterThan(0);
    row.tags[0] = "memory";
    expect(score(row)).toBeNull();
    row.descriptionZh = "浏览器自动化";
    expect(score(row)).toBeGreaterThan(0);
  });
});
