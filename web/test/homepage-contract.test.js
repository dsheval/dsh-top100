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

test("describes installation evidence without promising install success", () => {
  assert.match(html, /仅看有安装源/);
  assert.doesNotMatch(html, /仅看可安装/);
  assert.match(html, /不代表已安装验证/);
});

test("keeps install actions hidden when no matching source is available", () => {
  assert.match(html, /\.plugin-list \.plugin \.quick-install\[hidden\],[\s\S]*?\.plugin-list \.plugin \.install-action\[hidden\] \{\s*display: none;/);
  assert.match(html, /if \(command\) \{\s*installAction\.hidden = false/);
  assert.match(html, /class="github-link quick-install"[^>]* hidden/);
  assert.match(html, /class="plugin-action install-action"[^>]* hidden/);
});

test("places editorial 000 inside the table using shared row styles, without a score", () => {
  const aside = html.match(/<aside class="plugin featured-plugin"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(aside);
  assert.match(aside, /#000/);
  assert.match(aside, /本站出品 · 不参与排名/);
  assert.match(aside, /data-content-switch="dsh"/);
  assert.match(aside, /class="github-link"[^>]*href="https:\/\/github\.com\/dsheval\/dsh-top100"/);
  assert.match(aside, /aria-label="在 GitHub 打开 dsh-top100"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.doesNotMatch(aside, /class="stars"|data-copy-command|data-rank=/);
  assert.match(aside, /class="rank"/);
  assert.match(aside, /class="plugin-name"/);
  assert.match(aside, /class="plugin-description"/);
  assert.match(aside, /把插件榜单带进 DSH，发现、安装和管理插件。/);
  assert.ok(html.indexOf(aside) > html.indexOf('id="plugin-list"'));
  assert.match(html, /fragment\.prepend\(featuredPlugin\)/);
  assert.match(html, /\.plugin-list\.is-top100-list \.featured-plugin\[hidden\] \{ display: none; \}/);
  assert.match(html, /featuredPlugin\.hidden = !showFeaturedPlugin/);
  assert.match(html, /view: currentView === "top100" \? "hot" : currentView === "all" \? "total" : currentView/);
});

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
  assert.match(html, /await ensureViewData\(view\)/);
  assert.match(html, /const requestedRankingView = currentView/);
  assert.match(html, /if \(requestedCategory\) await loadNextCategoryPage\(\)/);
  assert.match(html, /else await loadNextTotalPage\(\)/);
  assert.doesNotMatch(html, /if \(currentView === "all"\) await loadNextTotalPage\(\)/);
  assert.match(html, /loadMore\.disabled = !indexed/);
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
  assert.match(categorySystem, /id: "knowledge",\s*label: "知识"/);
  assert.match(categorySystem, /className = "category-icon"/);
  assert.match(categoryStyles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(categoryStyles, /scroll-snap-type: inline proximity/);
  assert.match(categoryStyles, /@media \(min-width: 641px\) and \(max-width: 1100px\)[\s\S]*?\.category-count \{ display: none; \}/);
  assert.doesNotMatch(skills, /<select[^>]+id="category"/);
  assert.match(skills, /aria-label="Skill 分类"/);
  assert.match(html, /当前快照：.*个已验证插件.*已排除.*个 Skills/);
});

test("aligns installation controls and badges while keeping utility text readable", () => {
  const badge = html.match(/\.trust-pill,\s*\.type-pill\s*\{([^}]+)\}/)?.[1];
  const skillsLink = html.match(/\.skill-filter\s*\{([^}]+)\}/)?.[1];
  const listHead = html.match(/\.list-head\s*\{([^}]+)\}/)?.[1];
  assert.ok(badge && skillsLink && listHead);
  assert.match(badge, /align-items: center/);
  assert.match(badge, /justify-content: center/);
  assert.match(badge, /font: 600 11px\/1\.4 var\(--sans\)/);
  assert.match(skillsLink, /font: 700 14px\/1\.4 var\(--sans\)/);
  assert.match(skillsLink, /justify-content: center/);
  assert.match(listHead, /font: 700 13px\/1\.4 var\(--sans\)/);
  assert.match(html, /\.meta-growth\s*\{[^}]*font: 600 13px\/1\.5 var\(--sans\)/);
  assert.match(html, /\.meta-growth:not\(\[hidden\]\)[^}]*flex-wrap: wrap/);
  assert.match(html, /\.growth-period \{ white-space: nowrap; \}/);
  assert.match(html, /period\.className = "growth-period"/);
  assert.match(html, /id="tab-rising"[^>]*>\s*新锐榜\s*<\/button>/);
});

test("keeps category counts and tooltip totals legible without compressing digits", () => {
  const countStyle = categoryStyles.match(/\.category-count\s*\{([^}]+)\}/)?.[1];
  const titleStyle = categoryStyles.match(/\.category-description-title\s*\{([^}]+)\}/)?.[1];
  assert.ok(countStyle && titleStyle);
  assert.match(countStyle, /font: 600 12px\/1\.4 var\(--sans\)/);
  assert.match(countStyle, /flex-shrink: 0/);
  assert.match(countStyle, /color: var\(--muted\)/);
  assert.match(titleStyle, /font: 700 13px\/1\.4 var\(--sans\)/);
  for (const style of [countStyle, titleStyle]) {
    assert.match(style, /font-variant-numeric: tabular-nums/);
    assert.match(style, /letter-spacing: normal/);
  }
});

test("distinguishes the toggle filter from the quieter ranking result count", () => {
  const rowStyle = html.match(/\.search-status-row\s*\{([^}]+)\}/)?.[1];
  const resultStyle = html.match(/\.search-result\s*\{([^}]+)\}/)?.[1];
  const filterStyle = html.match(/\.install-filter\s*\{([^}]+)\}/)?.[1];
  assert.ok(rowStyle && resultStyle && filterStyle);
  assert.match(rowStyle, /font: 500 13px\/20px var\(--sans\)/);
  assert.match(rowStyle, /color: var\(--muted\)/);
  assert.match(rowStyle, /font-variant-numeric: tabular-nums/);
  assert.match(rowStyle, /letter-spacing: normal/);
  assert.match(resultStyle, /font: inherit/);
  assert.match(resultStyle, /color: inherit/);
  assert.match(filterStyle, /font: 600 14px\/20px var\(--sans\)/);
  assert.match(filterStyle, /color: var\(--ink\)/);
  assert.match(filterStyle, /background: var\(--card\)/);
  assert.match(filterStyle, /border: 1px solid var\(--line\)/);
  assert.match(filterStyle, /min-height: 44px/);
  assert.match(filterStyle, /align-items: center/);
  assert.match(filterStyle, /justify-content: center/);
});

test("uses a native toggle button with an accessible state and a selected checkmark", () => {
  const button = html.match(/<button class="install-filter"[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /id="installable-only" type="button" aria-pressed="false"/);
  assert.match(button, /aria-hidden="true"/);
  assert.match(button, /<span>仅看有安装源<\/span>/);
  assert.match(html, /installableToggle\.addEventListener\("click",/);
  assert.match(html, /installableOnly = !installableOnly/);
  assert.match(html, /installableToggle\.setAttribute\("aria-pressed", String\(installableOnly\)\)/);
  assert.doesNotMatch(html, /installableToggle\.checked/);
  assert.match(html, /\.install-filter\[aria-pressed="true"\] \{[^}]*background: var\(--accent-soft\)/);
  assert.match(html, /\.install-filter\[aria-pressed="true"\] \.filter-check \{ display: block; \}/);
  assert.match(html, /\.install-filter:focus-visible \{[^}]*outline: 2px solid var\(--accent\)/);
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
  assert.match(html, /filterDiscoveryEntries\(categoryScoped/);
  assert.match(html, /let activeSearchSort = "relevance"/);
  assert.match(html, /for \(const nextState of Object\.values\(viewState\)\)/);
  assert.doesNotMatch(html, /id="search-(?:top100|rising|all)"/);
});

test("serves local assets with same-origin production ranking data", () => {
  assert.equal(packageJson.scripts.serve, "node scripts/serve-dev.mjs");
  assert.match(devServer, /requestUrl\.pathname\.startsWith\("\/data\/"\)/);
  assert.match(devServer, /https:\/\/www\.dsheval\.ai/);
  assert.match(devServer, /requestUrl\.pathname === "\/api\/events"/);
});

test("keeps the install guide focused and uses the canonical brand name", () => {
  assert.match(html, /<title>dsh-top100 ·/);
  assert.match(html, /<span>dsh-top100<\/span>/);
  for (const page of [html, dsh, skills]) assert.doesNotMatch(page, /dsh-Top100|DSH-Top100/);
  assert.match(html, /body:has\(#dsh-view:not\(\[hidden\]\)\) \.hero \{\s*display: none/);
  assert.match(html, /body:has\(#dsh-view:not\(\[hidden\]\)\) \.ranking \{[^}]*scroll-margin-top: 64px/);
  assert.match(html, /#dsh-view \{\s*max-width: 800px/);
  assert.match(html, /<h1 class="inline-docs-title" id="inline-dsh-title">安装 dsh-top100<\/h1>/);
  assert.match(html, /class="wordmark" href="\.\/#top"/);
  assert.doesNotMatch(dsh, /dsh-brief-grid|section-kicker|dsh-data-note|3 步完成安装/);
  assert.match(dsh, /网站与插件使用同一份榜单数据/);
  assert.match(dsh, /每日更新/);
  assert.doesNotMatch(dsh, /Manifest 哈希校验/);
  assert.match(dsh, /DSHeval 排行服务/);
  assert.doesNotMatch(dsh, />rankings\.json</);
});

test("guides installation through three steps before collapsed secondary help", () => {
  const [primary, help] = dsh.split('<section class="doc-section" id="help"');
  assert.ok(primary && help);
  assert.equal((primary.match(/class="dsh-install-step"/g) ?? []).length, 3);
  assert.equal((primary.match(/data-copy-command=/g) ?? []).length, 2);
  assert.match(primary, /DSH Web 0\.1\.0-rc\.6\+/);
  assert.match(primary, /Node\.js 22\.13\+/);
  assert.match(primary, /看到榜单，即可开始使用/);
  assert.match(primary, /不会自动安装榜单中的项目/);
  assert.match(html, /\.dsh-open-target strong \{[^}]*color: var\(--ink\)/);
  assert.match(html, /#dsh-view \.dsh-step-content > \.dsh-success \{[^}]*color: var\(--muted\)/);
  assert.doesNotMatch(html, /#dsh-view \.dsh-step-content > \.dsh-success \{[^}]*font-size/);
  assert.equal((help.match(/<details\b/g) ?? []).length, 4);
  assert.doesNotMatch(help, /<details[^>]*\sopen(?:\s|>|=)/);
  assert.match(help, /安装和启动必须使用相同的命令前缀/);
  assert.match(help, /不要单独添加 <code>--legacy-peer-deps/);
});

test("preserves copyable command pairs for all three supported launch methods", () => {
  const commands = [...dsh.matchAll(/data-copy-command="([^"]+)"/g)].map((match) => match[1]);
  const displayed = [...dsh.matchAll(/<code class="dsh-install-command">([^<]+)<\/code>/g)].map((match) => match[1]);
  assert.deepEqual(commands, displayed);
  assert.deepEqual(commands, [
    "npx @deepseek-ai/dsh plugin --profile web add @dsheval/dsh-top100-plugin",
    "npx @deepseek-ai/dsh web",
    "dsh plugin --profile web add @dsheval/dsh-top100-plugin",
    "dsh web",
    "pnpm dsh plugin --profile web add @dsheval/dsh-top100-plugin",
    "pnpm dsh web",
  ]);
  const labels = [...dsh.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(labels.length, 6);
  assert.equal(new Set(labels).size, labels.length);
});

test("separates the three installation steps from usage previews and optional help", () => {
  const install = dsh.match(/<section class="doc-section" id="install"[\s\S]*?<\/section>/)?.[0];
  assert.ok(install);
  assert.equal((install.match(/class="dsh-install-step"/g) ?? []).length, 3);
  assert.equal((install.match(/data-copy-command=/g) ?? []).length, 2);
  assert.doesNotMatch(install, /<img|<details/);
  assert.match(install, /安装榜单插件/);
  assert.match(install, /启动 DSH Web/);
  assert.match(install, /进入插件排行/);
  assert.ok(dsh.indexOf('class="dsh-scope-note"') < dsh.indexOf('id="install"'));
  assert.ok(dsh.indexOf('id="install"') < dsh.indexOf('id="preview"'));
  assert.ok(dsh.indexOf('id="preview"') < dsh.indexOf('id="help"'));
  assert.match(dsh, /其他方式与帮助/);
});

test("shows the market preview first and keeps the other-plugin installation example optional", async () => {
  const preview = dsh.match(/<section class="doc-section" id="preview"[\s\S]*?<\/section>/)?.[0];
  assert.ok(preview);
  assert.ok(dsh.indexOf(preview) > dsh.indexOf("</ol>"));
  assert.ok(dsh.indexOf(preview) < dsh.indexOf('id="help"'));
  assert.match(preview, /本地开发版截图/);
  assert.ok(preview.indexOf('dsh-plugin-market.png') < preview.indexOf('<details'));
  const example = preview.match(/<details class="dsh-detail dsh-install-example">[\s\S]*?<\/details>/)?.[0];
  assert.ok(example);
  assert.match(example, /如何安装榜单中的其他插件？/);
  assert.match(example, /dsh-install-confirm\.png/);
  assert.match(example, /来源校验不等于安全审核/);
  assert.match(example, /安装后重启 DSH/);
  assert.doesNotMatch(preview, /<details[^>]*\sopen(?:\s|>|=)/);
  const images = [...preview.matchAll(/<img src="([^"]+)" width="(\d+)" height="(\d+)" loading="lazy" decoding="async" alt="([^"]+)">/g)];
  assert.equal(images.length, 2);
  for (const [, src, width, height] of images) {
    assert.match(src, /^\.\/assets\/dsh-(plugin-market|install-confirm)\.png$/);
    const image = await readFile(new URL(src.replace("./", "../public/"), import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), Number(width));
    assert.equal(image.readUInt32BE(20), Number(height));
    assert.ok(image.length < 400_000);
    assert.ok(preview.includes(`href="${src}" target="_blank" rel="noopener noreferrer"`));
  }
  assert.match(html, /#dsh-view \.dsh-preview-link:focus-visible/);
  assert.match(html, /#dsh-view \.dsh-market-preview \{\s*max-width: 640px/);
  assert.match(html, /#dsh-view \.dsh-confirm-preview \{\s*max-width: 480px/);
  assert.doesNotMatch(html, /\.dsh-preview-grid/);
  assert.match(dsh, /不会自动安装榜单中的项目/);
});

test("separates expanded installation methods and strengthens guide-only contrast", () => {
  const guideStyle = html.match(/#dsh-view \{([^}]+)\}/)?.[1];
  assert.ok(guideStyle);
  assert.match(guideStyle, /--muted: #364b43/);
  assert.match(guideStyle, /--code-surface: #203c33/);
  assert.match(guideStyle, /--code-ink: #f7f9f8/);
  assert.match(html, /#dsh-view \.doc-section > h2 \{[^}]*font-size: 20px/);
  assert.match(html, /\.dsh-detail summary \{[^}]*font: 600 16px/);
  assert.match(html, /#dsh-view \.dsh-method h3 \{[^}]*font: 600 15px/);
  assert.match(html, /\.dsh-detail-body \{[^}]*padding: 0;/);
  assert.doesNotMatch(html, /\.dsh-detail-body \{[^}]*border-left/);
  assert.match(html, /\.dsh-detail summary \{[^}]*color: var\(--ink\)/);
  assert.match(html, /#dsh-view \.dsh-method h3 \{[^}]*color: var\(--ink\)/);
  assert.doesNotMatch(html, /\.dsh-detail\[open\] summary \{/);
  assert.match(html, /\.dsh-command-group \.dsh-command-row \{\s*border: 0/);
  assert.doesNotMatch(html, /\.dsh-method \+ \.dsh-method \{[^}]*border-top/);
  assert.doesNotMatch(html, /\.dsh-detail-body \.dsh-command-row \+ \.dsh-command-row/);
  const methods = [...dsh.matchAll(/<section class="dsh-method" aria-labelledby="([^"]+)">([\s\S]*?)<\/section>/g)];
  assert.equal(methods.length, 2);
  for (const [, id, content] of methods) {
    assert.ok(content.includes('id="' + id + '"'));
    assert.equal((content.match(/class="dsh-command-group"/g) ?? []).length, 1);
    assert.ok(content.indexOf('class="dsh-command-group"') < content.indexOf('data-copy-command='));
    assert.equal((content.match(/data-copy-command=/g) ?? []).length, 2);
  }
  const luminance = (hex) => hex.match(/[a-f\d]{2}/gi)
    .map((part) => parseInt(part, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const color = (name) => guideStyle.match(new RegExp(name + ": (#[a-f0-9]{6})"))?.[1];
  for (const [foreground, background] of [
    [color("--muted"), "#f7f9f8"],
    [color("--code-ink"), color("--code-surface")],
    ["#ffffff", "#126657"],
  ]) {
    const light = luminance(foreground), dark = luminance(background);
    assert.ok((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) >= 4.5);
  }
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
  assert.match(dsh, /当前发布版本为[\s\S]*?@dsheval\/dsh-top100-plugin\/v\/1\.3\.0/);
  assert.match(dsh, /npx @deepseek-ai\/dsh plugin --profile web add @dsheval\/dsh-top100-plugin/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(html, /\.plugin-name \{[\s\S]*?line-height: 1\.14/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?padding-bottom: 0\.08em/);
  assert.match(html, /nameText\.title = name/);
  assert.match(html, /\.plugin:hover,[\s\S]*?box-shadow: inset 3px 0 0 var\(--accent\)/);
});
