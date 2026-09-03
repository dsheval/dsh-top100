import assert from "node:assert/strict";
import test from "node:test";
import { filterDiscoveryEntries, requiresSearchIndex } from "../public/discovery-filter.js";

const row = (rank, name, extra = {}) => ({ rank, plugin: { rank, name, fullName: `acme/${name}`, type: "cordis-plugin", ...extra } });

test("search uses the complete catalog on every ranking tab; normal first paint stays lightweight", () => {
  for (const view of ["top100", "rising", "all"]) {
    assert.equal(requiresSearchIndex(view, "browser", false), true);
    assert.equal(requiresSearchIndex(view, "", false), false);
  }
  assert.equal(requiresSearchIndex("all", "", true), true);
  assert.equal(requiresSearchIndex("top100", "", true), false);
});

test("relevance is the default and never overwrites the repository rank", () => {
  const rows = [row(1, "market", { description: "browser" }), row(120, "browser")];
  assert.deepEqual(filterDiscoveryEntries(rows, { query: "browser" }).map(r => r.rank), [120, 1]);
  assert.deepEqual(filterDiscoveryEntries(rows, { query: "browser", sort: "rank" }).map(r => r.rank), [1, 120]);
});

test("installation and category filters compose without guessing installation targets", () => {
  const valid = row(130, "browser", { categories: ["tools"], install: { commands: ["dsh plugin add github:acme/browser"] } });
  const unsafe = row(1, "browser-unsafe", { categories: ["tools"], installTarget: "wrong-package" });
  const other = row(2, "browser-other", { categories: ["coding"], installTarget: "github:acme/browser-other" });
  const options = { query: "browser", category: "tools", installableOnly: true };
  assert.deepEqual(filterDiscoveryEntries([unsafe, other, valid], options, (entry, category) => entry.plugin.categories.includes(category)), [valid]);
  assert.deepEqual(filterDiscoveryEntries([unsafe], options), []);
});
