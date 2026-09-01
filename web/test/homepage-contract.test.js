import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dsh = await readFile(new URL("../public/dsh.html", import.meta.url), "utf8");

test("boots from lightweight hot data and never falls back to the full catalog", () => {
  assert.match(html, /const MANIFEST_URL = "\.\/data\/manifest\.json"/);
  assert.match(html, /hot: "\.\/data\/rankings-hot\.json"/);
  assert.match(html, /total: "\.\/data\/rankings-total\.json"/);
  assert.match(html, /await fetchJson\(MANIFEST_URL, \{ manifestRequest: true \}\)/);
  assert.match(html, /await fetchJson\(manifest\.datasets\.hot\.url\)/);
  assert.match(html, /falling back to the lightweight legacy hot list/);
  assert.doesNotMatch(html, /["']\.\/data\/rankings\.json["']/);
});

test("loads deferred datasets through their manifest URLs", () => {
  assert.match(html, /manifest\.datasets\.rising\.url/);
  assert.match(html, /manifest\.datasets\.total\.pages/);
  assert.match(html, /manifest\?\.datasets\?\.search\?\.url/);
  assert.match(html, /manifest\?\.categories\?\.find/);
  assert.match(html, /totalPageLoadPromise/);
  assert.match(html, /categoryPageLoadPromises/);
  assert.match(html, /viewSwitchGeneration/);
  assert.match(html, /switchGeneration !== viewSwitchGeneration/);
  assert.match(html, /searchGenerations/);
  assert.match(html, /if \(!isCurrentSearchRequest\(\)\) return/);
  assert.match(html, /isCurrentSearchRequest\(\) && currentView === view/);
  assert.match(html, /initialDataPromise = loadManifestAndHot\(\)/);
  assert.match(html, /if \(initialDataPromise\) await initialDataPromise/);
  assert.match(html, /dataSearchGeneration !== searchGenerations\[requestedRankingView\]/);
  assert.match(html, /else await ensureViewData\(view\)/);
  assert.match(html, /const requestedRankingView = currentView/);
  assert.match(html, /if \(requestedRankingView === "all"\) await loadNextTotalPage\(\)/);
  assert.doesNotMatch(html, /if \(currentView === "all"\) await loadNextTotalPage\(\)/);
  assert.match(html, /loadMore\.disabled = !searchActive/);
  assert.match(html, /else if \(isSameRankingContext\(\)\) renderRanking\(\)/);
});

test("contains the homepage conversion, privacy and SEO contracts", () => {
  assert.match(html, /id="hero-search-form"/);
  assert.doesNotMatch(html, /market-radar|radar-item|renderMarketRadar/);
  assert.match(html, /data-copy-command="npx @deepseek-ai\/dsh plugin/);
  assert.match(html, /data-track-ranking-view="hot"/);
  assert.match(html, /track\("search_used"/);
  assert.match(html, /closest\("a\.github-link, a\.card-github-link"\)/);
  assert.doesNotMatch(html, /closest\("\.github-link, \.card-github-link"\)/);
  assert.doesNotMatch(html, /track\([^\n]+state\.query/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.dsheval\.ai\/"/);
  assert.match(html, /type="application\/ld\+json"/);
  assert.doesNotMatch(html, /github\.githubassets\.com\/favicons/);
});

test("uses the approved light mineral palette without yellow UI panels", () => {
  assert.match(html, /--hero: #e7eeec/);
  assert.match(html, /--hero-accent: #2f6f68/);
  assert.match(html, /--code-surface: #eef2f1/);
  assert.match(html, /<meta name="theme-color" content="#e7eeec" \/>/);
  assert.match(html, /\.dsh-step-number \{[\s\S]*?border-radius: 50%/);
  assert.match(html, /\.dsh-copy-button \{[\s\S]*?color: var\(--accent\);[\s\S]*?background: var\(--card\)/);
  assert.doesNotMatch(html, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(html, /color-scheme:\s*dark/);
  assert.doesNotMatch(html, /#f1c75b|rgba\(241,\s*199,\s*91|#d39b1d|#fffaf0/i);
  assert.doesNotMatch(html, /#a95a5a|#fbf4f3/i);
});

test("keeps the install guide balanced and uses the canonical brand name", () => {
  assert.match(html, /<title>dsh-Top100 ·/);
  assert.match(html, /<span>dsh-Top100<\/span>/);
  assert.match(html, /\.dsh-data-note \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(html, /\.dsh-data-note \{[\s\S]*?border-left: 2px solid/);
  assert.match(html, /#dsh-view \.doc-section:last-child \{[\s\S]*?border-bottom: 0/);
  assert.match(html, /\.dsh-data-note-meta \{[\s\S]*?white-space: nowrap/);
  assert.match(html, /\.dsh-warning-detail \{[\s\S]*?background: var\(--card\);[\s\S]*?box-shadow: none/);
  assert.match(dsh, /class="dsh-data-note"/);
  assert.match(dsh, /网站与插件使用同一份榜单数据/);
  assert.match(dsh, /每日更新/);
  assert.doesNotMatch(dsh, /Manifest 哈希校验/);
  assert.match(dsh, /DSHeval 排行服务/);
  assert.doesNotMatch(dsh, />rankings\.json</);
});

test("keeps ranking rows subtly banded and clamps long plugin names", () => {
  assert.doesNotMatch(html, /tone-soft|tone-paper/);
  assert.doesNotMatch(html, /\.plugin:nth-child\(-n \+ 4\)/);
  assert.match(html, /\.plugin-list\.is-top100-list \.plugin:nth-child\(even\) \{[\s\S]*?var\(--accent-soft\) 22%/);
  assert.doesNotMatch(html, /\.plugin-list\.is-top100-list \.plugin:nth-child\(-n \+ 3\)/);
  assert.doesNotMatch(html, /ranking-(?:glow|orbit-drift)/);
  assert.doesNotMatch(html, /signal-(?:field|core|float|core-pulse)|orbit-(?:forward|reverse)/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(html, /\.plugin-name \{[\s\S]*?line-height: 1\.14/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?padding-bottom: 0\.08em/);
  assert.match(html, /nameText\.title = name/);
  assert.match(html, /\.plugin:hover,[\s\S]*?box-shadow: inset 3px 0 0 var\(--accent\)/);
});
