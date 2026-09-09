import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { requiresSearchIndex, filterDiscoveryEntries } from "../public/discovery-filter.js";
import { normalizeSearchText, tokenizeSearchQuery } from "../public/search-engine.js";
import { catalogPresentation, catalogInstallCapability, installCommand } from "../public/catalog-presentation.js";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
function sourceBetween(start, end, after = 0) {
  const first = html.indexOf(start, after);
  const last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `missing source section: ${start}`);
  return html.slice(first, last);
}

// Run the page's actual rendering, pagination and filter handlers. The DOM stub
// only records rendered rows and button state; the catalog has three small pages.
class Element {
  constructor() {
    this.dataset = {};
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.children = [];
    this.nodes = new Map();
    this.handlers = new Map();
    this.classList = { add() {}, toggle() {} };
  }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }
  querySelectorAll() { return []; }
  setAttribute() {}
  closest() { return this; }
  appendChild(node) { this.children.push(node); }
  prepend(node) { this.children.unshift(node); }
  replaceChildren(...nodes) {
    this.children = nodes.flatMap((node) => node.fragment ? node.children : [node]);
  }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  cloneNode() { return new Element(); }
  click() { return this.handlers.get("click")(); }
}

function createPage(category = null) {
  const entries = Array.from({ length: 250 }, (_, index) => ({
    rank: index + 1,
    name: `plugin-${index + 1}`,
    descriptionZh: "示例插件",
    plugin: {
      rank: index + 1, totalRank: index + 1, name: `plugin-${index + 1}`,
      fullName: `example/plugin-${index + 1}`, type: "cordis-plugin",
      categories: ["tools"], stars: 1000 - index,
      installTarget: `github:example/plugin-${index + 1}`,
    },
  }));
  const pages = [0, 1, 2].map((index) => ({ url: `/page-${index}` }));
  const requests = [];
  const page = {
    PAGE_SIZE: 100, currentView: "all", activeCategory: category,
    activeSearchSort: "relevance", installableOnly: false,
    viewState: Object.fromEntries(["top100", "rising", "all"].map((view) => [view, {
      query: "", visible: 100, unfilteredVisible: 100,
    }])),
    searchGenerations: { top100: 0, rising: 0, all: 0 },
    rankedEntries: entries.slice(0, 100), categoryEntries: category ? entries.slice(0, 100) : [],
    hotEntries: [], risingEntries: [], searchEntries: entries,
    totalPageLoaded: 1, categoryPageLoaded: category ? 1 : 0,
    manifest: {
      datasets: { total: { count: 250, pageCount: pages.length, pages } },
      categories: [{ id: "tools", count: 250, pageCount: pages.length, pages }],
    },
    categoryLabels: { tools: "工具" }, categoryPageLoadPromises: new Map(),
    totalPageLoadPromise: null, excludedHotSkillCount: 0, revealObserver: null,
    searchSortButtons: [],
    requiresSearchIndex, filterDiscoveryEntries, normalizeSearchText, tokenizeSearchQuery,
    catalogPresentation, catalogInstallCapability, installCommand,
    makeEntries: (rows) => rows,
    fetchJson: async (url) => {
      requests.push(url);
      const index = pages.findIndex((page) => page.url === url);
      return { rankings: entries.slice(index * 100, (index + 1) * 100) };
    },
    formatStars: (value) => String(Number(value) || 0),
    entryMatchesCategory: (entry, id) => entry.plugin.categories.includes(id),
    showFeaturedPlugin: () => false,
    enhanceDescriptions() {}, observeReveal() {}, track() {}, showFeedback() {},
    showCategoryDescription() {}, hideCategoryDescription() {},
    document: {
      createDocumentFragment: () => Object.assign(new Element(), { fragment: true }),
      createElement: () => new Element(),
    },
  };
  for (const key of ["featuredPlugin", "searchInput", "list", "listHead", "loadMore",
    "rankingMetaTitle", "rankHead", "searchClear", "searchSort", "searchResult",
    "rankingStatus", "installableToggle"]) page[key] = new Element();
  page.template = { content: new Element() };
  const allCategoryButton = new Element();
  allCategoryButton.dataset.category = "";
  page.categoryButtons = [allCategoryButton];
  const context = vm.createContext(page);
  vm.runInContext([
    sourceBetween("      async function loadNextTotalPage()", "      async function loadSearchEntries()"),
    sourceBetween("      function renderRanking()", "      function showFeedback(message)"),
    sourceBetween('      installableToggle.addEventListener("click",', '\n      try {\n        initialDataPromise'),
    sourceBetween("        for (const button of categoryButtons) {", '\n        loadMore.addEventListener', html.indexOf("        initialDataPromise = loadManifestAndHot()")),
    sourceBetween('        loadMore.addEventListener("click",', '\n        await setView(currentView'),
    "function setView() { renderRanking(); }\nrenderRanking();",
  ].join("\n"), context);
  return { page, requests, allCategoryButton };
}

function renderedRanks(page) {
  return page.list.children.slice(1).map((row) => row.querySelector(".rank").textContent);
}

for (const category of [null, "tools"]) {
  test(`${category ?? "total"} pagination remains reachable after installation filtering resets a fully loaded list`, async () => {
    const { page, requests } = createPage(category);
    await page.loadMore.click();
    await page.loadMore.click();
    assert.equal(renderedRanks(page).length, 250);
    assert.equal(page.loadMore.hidden, true);
    assert.equal(requests.length, 2);

    page.installableToggle.click();
    page.installableToggle.click();
    assert.equal(renderedRanks(page).length, 100);
    assert.equal(page.loadMore.hidden, false, "cached results must remain reachable");
    await page.loadMore.click();
    assert.equal(renderedRanks(page).length, 200);
    assert.equal(page.loadMore.hidden, false);
    await page.loadMore.click();
    assert.equal(renderedRanks(page).length, 250);
    assert.equal(page.loadMore.hidden, true);
    assert.equal(requests.length, 2, "expanding cached rows must not refetch pages");
    assert.equal(new Set(renderedRanks(page)).size, 250);
  });
}

test("reselecting all categories keeps cached total-ranking pages accessible", async () => {
  const { page, requests, allCategoryButton } = createPage();
  await page.loadMore.click();
  await page.loadMore.click();
  allCategoryButton.click();
  assert.equal(renderedRanks(page).length, 100);
  assert.equal(page.loadMore.hidden, false);
  await page.loadMore.click();
  await page.loadMore.click();
  assert.equal(renderedRanks(page).length, 250);
  assert.equal(requests.length, 2);
});

test("pagination expands cached rows before requesting the next unloaded page", async () => {
  const { page, requests } = createPage();
  await page.loadMore.click();
  page.installableToggle.click();
  page.installableToggle.click();
  await page.loadMore.click();
  assert.equal(renderedRanks(page).length, 200);
  assert.equal(requests.length, 1);
  await page.loadMore.click();
  assert.equal(renderedRanks(page).length, 250);
  assert.equal(requests.length, 2);
  assert.equal(page.loadMore.hidden, true);
});

for (const category of [null, "tools"]) {
  test(`${category ?? "total"} pagination restores a retryable button after a page request fails`, async () => {
    const { page } = createPage(category);
    const originalFetch = page.fetchJson;
    let attempts = 0;
    page.fetchJson = async (url) => {
      if (++attempts === 1) throw new Error("temporary page failure");
      return originalFetch(url);
    };
    const pending = page.loadMore.click();
    assert.equal(page.loadMore.textContent, "正在加载…");
    assert.equal(page.loadMore.disabled, true);
    await pending;
    assert.equal(renderedRanks(page).length, 100);
    assert.equal(page.loadMore.disabled, false);
    assert.equal(page.loadMore.hidden, false);
    assert.equal(page.loadMore.textContent, "继续加载（剩余 150）");
    await page.loadMore.click();
    assert.equal(attempts, 2);
    assert.equal(renderedRanks(page).length, 200);
    assert.equal(page.loadMore.textContent, "继续加载（剩余 50）");
    assert.equal(page.loadMore.disabled, false);
  });
}

test("a pending page does not overwrite a newer search result", async () => {
  const { page } = createPage();
  const originalFetch = page.fetchJson;
  let release;
  page.fetchJson = async (url) => {
    await new Promise((resolve) => { release = resolve; });
    return originalFetch(url);
  };
  const pending = page.loadMore.click();
  page.viewState.all.query = "plugin-250";
  page.searchGenerations.all += 1;
  page.setView();
  const searchRanks = renderedRanks(page);
  release();
  await pending;
  assert.deepEqual(renderedRanks(page), searchRanks);
  assert.equal(page.viewState.all.visible, 100);
  assert.equal(page.loadMore.disabled, false);
});
