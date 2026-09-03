import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dsh = await readFile(new URL("../public/dsh.html", import.meta.url), "utf8");
const skills = await readFile(new URL("../public/skills.html", import.meta.url), "utf8");
const categorySystem = await readFile(new URL("../public/category-system.js", import.meta.url), "utf8");
const categoryStyles = await readFile(new URL("../public/category-system.css", import.meta.url), "utf8");
const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8")
);
const devServer = await readFile(new URL("../../scripts/serve-dev.mjs", import.meta.url), "utf8");

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
  assert.match(html, /if \(requestedCategory\) await loadNextCategoryPage\(\)/);
  assert.match(html, /else await loadNextTotalPage\(\)/);
  assert.doesNotMatch(html, /if \(currentView === "all"\) await loadNextTotalPage\(\)/);
  assert.match(html, /loadMore\.disabled = !searchActive/);
  assert.match(html, /else if \(isSameRankingContext\(\)\) renderRanking\(\)/);
});

test("contains the homepage conversion, privacy and SEO contracts", () => {
  assert.match(html, /id="hero-search-form"/);
  assert.doesNotMatch(html, /market-radar|radar-item|renderMarketRadar/);
  assert.match(html, /data-content-switch="dsh"/);
  assert.match(dsh, /data-copy-command="npx @deepseek-ai\/dsh plugin/);
  assert.match(html, /data-track-ranking-view="hot"/);
  assert.match(html, /track\("search_used"/);
  assert.match(html, /closest\("a\.github-link, a\.card-github-link"\)/);
  assert.doesNotMatch(html, /closest\("\.github-link, \.card-github-link"\)/);
  assert.doesNotMatch(html, /track\([^\n]+state\.query/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.dsheval\.ai\/"/);
  assert.match(html, /type="application\/ld\+json"/);
  assert.doesNotMatch(html, /github\.githubassets\.com\/favicons/);
});

test("uses the approved neutral sage palette", () => {
  assert.match(html, /--paper: #f7f9f8/);
  assert.match(html, /--hero: #d9e7e2/);
  assert.match(html, /--hero-ink: #13201c/);
  assert.match(html, /--hero-accent: #126657/);
  assert.match(html, /--code-surface: #e8eeec/);
  assert.match(html, /--line: rgba\(19, 32, 28, 0\.26\)/);
  assert.match(html, /--line-strong: #6f837c/);
  assert.match(html, /--signal-brass: #9b8e63/);
  assert.match(html, /--signal-sage: #7f9f95/);
  assert.match(html, /<meta name="theme-color" content="#d9e7e2" \/>/);
  assert.match(html, /\.dsh-step-number \{[\s\S]*?border-radius: 50%/);
  assert.match(html, /\.dsh-copy-button \{[\s\S]*?color: var\(--accent\);[\s\S]*?background: var\(--card\)/);
  assert.doesNotMatch(html, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(html, /color-scheme:\s*dark/);
  assert.doesNotMatch(html, /#f1c75b|rgba\(241,\s*199,\s*91|#d39b1d|#fffaf0/i);
  assert.doesNotMatch(html, /#a95a5a|#fbf4f3/i);
});

test("softens the footer and keeps Skills outside plugin totals", () => {
  assert.match(html, /\.footer\s*\{[\s\S]*?min-height:\s*96px/);
  assert.match(html, /\.footer\s*\{[\s\S]*?background:\s*#2b443d/);
  assert.match(html, /\.footer span:last-child\s*\{[\s\S]*?color:\s*#c9d6d1/);
  assert.match(html, /href="\.\/skills\.html">Skills 技能库/);
  assert.match(html, /manifest\.datasets\.skills\?\.count/);
  assert.doesNotMatch(html, /隐藏 Skill 仓库|hideSkills|manifestSkillCount/);
  assert.match(skills, /manifest\?\.datasets\?\.skills\?\.url/);
  assert.match(html, /plugin\.type\?\.toLowerCase\(\) === "cordis-plugin"/);
  assert.match(skills, /const LEGACY_FULL_URL = "\.\/data\/rankings\.json"/);
  assert.match(skills, /legacy\?\.rankings\?\.total \?\? legacy\?\.rankings \?\? \[\]/);
  assert.match(skills, /entry\?\.type === "skill"/);
  assert.match(skills, /不参与插件 Top 100/);
});

test("shares one category interaction system across Plugin and Skills directories", () => {
  assert.match(html, /href="\.\/category-system\.css"/);
  assert.match(skills, /href="\.\/category-system\.css"/);
  assert.match(html, /renderCategoryOptions\(document\.querySelector\("#plugin-category-options"\)/);
  assert.match(skills, /renderCategoryOptions\(document\.querySelector\("#skill-category-options"\)/);
  assert.match(categorySystem, /label: "Agent 增强"/);
  assert.match(categorySystem, /className = "category-icon"/);
  assert.match(categoryStyles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(categoryStyles, /scroll-snap-type: inline proximity/);
  assert.match(categoryStyles, /@media \(min-width: 641px\) and \(max-width: 900px\)[\s\S]*?\.category-count \{ display: none; \}/);
  assert.doesNotMatch(skills, /<select[^>]+id="category"/);
  assert.match(skills, /aria-label="Skill 分类"/);
  assert.match(html, /当前快照：.*个已验证插件.*已排除.*个 Skills/);
});

test("keeps Skills utility text legible and aligned with Plugin typography", () => {
  assert.match(skills, /--muted: #4f5e59/);
  assert.match(skills, /\.directory-head p \{[^}]*font-size: 15px;[^}]*font-weight: 500/);
  assert.match(skills, /\.status \{[^}]*font-size: 13px;[^}]*font-weight: 500/);
  assert.match(skills, /\.tag \{[^}]*min-height: 24px;[^}]*font: 700 11px\/1\.1 var\(--mono\)/);
  assert.match(skills, /\.card-link \{[^}]*align-self: flex-start;[^}]*font-size: 14px;[^}]*font-weight: 700/);
});

test("keeps discovery views ordered and uses one persistent ranking search", () => {
  assert.match(html, /id="tab-top100"[\s\S]*id="tab-rising"[\s\S]*id="tab-all"/);
  assert.doesNotMatch(html, /id="tab-category"|data-view="category"|分类榜/);
  assert.match(html, /id="category-filter-panel"/);
  assert.doesNotMatch(html, /id="category-filter-panel" hidden/);
  assert.match(categorySystem, /button\.dataset\.category = definition\.id/);
  assert.match(html, /id="ranking-search"/);
  assert.match(html, /data-search-sort="rank"/);
  assert.match(html, /data-search-sort="relevance"/);
  assert.match(html, /score: scoreSearchEntry\(entry\.plugin, state\.query\)/);
  assert.match(html, /for \(const nextState of Object\.values\(viewState\)\)/);
  assert.doesNotMatch(html, /id="search-(?:top100|rising|all)"/);
});

test("serves local assets with same-origin production ranking data", () => {
  assert.equal(packageJson.scripts.serve, "node scripts/serve-dev.mjs");
  assert.match(devServer, /requestUrl\.pathname\.startsWith\("\/data\/"\)/);
  assert.match(devServer, /https:\/\/www\.dsheval\.ai/);
  assert.match(devServer, /requestUrl\.pathname === "\/api\/events"/);
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
  assert.doesNotMatch(html, /class="signal-field"|class="signal-core"/);
  assert.match(html, /class="hero-side">[\s\S]*?class="install-console"/);
  assert.match(html, /class="release-grid"/);
  assert.match(html, /class="hero-command-row"/);
  assert.match(html, />安装到 DSH<\/a>/);
  assert.doesNotMatch(html, /hero-release-version/);
  assert.doesNotMatch(html, /class="release-band"/);
  assert.match(html, /data-copy-command="npx @deepseek-ai\/dsh plugin --profile web add @dsheval\/dsh-top100-plugin"/);
  assert.match(dsh, /当前发布版本：[\s\S]*?@dsheval\/dsh-top100-plugin@1\.2\.1/);
  assert.match(dsh, /npx @deepseek-ai\/dsh plugin --profile web add @dsheval\/dsh-top100-plugin/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(html, /\.plugin-name \{[\s\S]*?line-height: 1\.14/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?padding-bottom: 0\.08em/);
  assert.match(html, /nameText\.title = name/);
  assert.match(html, /\.plugin:hover,[\s\S]*?box-shadow: inset 3px 0 0 var\(--accent\)/);
});
