import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";

const repo = new URL("../../", import.meta.url);

test("local preview serves the Top100 mount and preserves old page queries", async (t) => {
  const server = spawn(process.execPath, ["scripts/serve-dev.mjs"], {
    cwd: repo,
    env: { ...process.env, WEB_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  });
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("preview did not start")), 5000);
    let output = "";
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    server.once("error", (error) => { clearTimeout(timeout); reject(error); });
    server.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`preview exited: ${code}`)); });
  });
  for (const [source, destination] of [
    ["/?page=dsh", "/top100/?page=dsh"],
    ["/top100?page=docs", "/top100/?page=docs"],
    ["/skills.html?category=coding", "/top100/skills.html?category=coding"],
  ]) {
    const response = await fetch(origin + source, { redirect: "manual" });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), destination);
    await response.text();
  }
  for (const page of ["", "skills.html", "docs.html"]) {
    const response = await fetch(`${origin}/top100/${page}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('aria-label="DSH-Eval 主导航"'));
    for (const path of ["/", "/results", "/methodology", "/faq", "/top100/"]) {
      assert.ok(html.includes(`href="${path}"`));
    }
    for (const [, path] of html.matchAll(/(?:src|href)="(\.\/[^"?#]+\.(?:css|js|svg))"/g)) {
      const asset = await fetch(new URL(path, `${origin}/top100/${page}`));
      assert.equal(asset.status, 200, path);
      assert.doesNotMatch(asset.headers.get("content-type"), /text\/html/, path);
      await asset.arrayBuffer();
    }
    if (page !== "docs.html") {
      assert.ok(html.includes('const MANIFEST_URL = "/data/manifest.json"'));
      assert.ok(!html.includes('"./data/'));
    }
  }
  const events = await fetch(`${origin}/api/events`, { method: "POST" });
  assert.equal(events.status, 204);
  const missing = await fetch(`${origin}/top100/missing.js`);
  assert.equal(missing.status, 404);
});

test("public catalog links migrate while released plugin data stays compatible", async () => {
  const read = async (path) => readFile(new URL(path, repo), "utf8");
  const pkg = JSON.parse(await read("plugin/package.json"));
  assert.equal(pkg.homepage, "https://www.dsheval.ai/top100/");
  const host = await read("plugin/src/host/catalog.ts");
  assert.ok(host.includes('DEFAULT_DATA_URL = "https://www.dsheval.ai/data"'));
  const recommendations = await read("plugin/src/host/recommendations.ts");
  assert.ok(recommendations.includes('DSHEVAL_CATALOG_URL = "https://www.dsheval.ai/top100/#ranking"'));
  const client = await read("plugin/src/client/RankingsPage.tsx");
  assert.ok(client.includes('DSHEVAL_SITE = "https://www.dsheval.ai/top100/"'));
  for (const file of ["README.md", "plugin/README.md"]) {
    const readme = await read(file);
    assert.ok(readme.includes("https://www.dsheval.ai/top100/?page=dsh#dsh"));
    assert.ok(readme.includes("不代表项目已通过能力评测"));
  }
  for (const file of ["index.html", "skills.html", "docs.html", "top300.html"]) {
    const html = await read(`web/public/${file}`);
    assert.match(html, /rel="canonical" href="https:\/\/www\.dsheval\.ai\/top100\//, file);
    assert.doesNotMatch(html, /https?:\/\/dsheval\.ai(?:\/|["\s<])/, file);
  }
  const home = await read("web/public/index.html");
  for (const property of ["og:url", "og:image"]) {
    assert.match(home, new RegExp(`property="${property}" content="https://www\\.dsheval\\.ai/top100/`));
  }
  const structuredData = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(structuredData.url, "https://www.dsheval.ai/top100/");
  assert.equal(structuredData.isPartOf.url, "https://www.dsheval.ai/");
  const robots = await read("web/public/robots.txt");
  assert.ok(robots.includes("Sitemap: https://www.dsheval.ai/top100/sitemap.xml"));
  const sitemap = await read("web/public/sitemap.xml");
  for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.equal(new URL(location).origin, "https://www.dsheval.ai");
  }
});

test("sticky content uses the single shared header while section navigation scrolls with the page", async () => {
  const read = async (path) => readFile(new URL(path, repo), "utf8");
  const styles = await read("web/public/site-controls.css");
  const chrome = await read("web/public/site-chrome.css");
  assert.match(chrome, /--site-header-height:\s*64px/);
  assert.doesNotMatch(styles, /--site-main-nav-height|--site-section-nav-height/);
  const sectionRule = styles.match(/\.top100-section-nav \{([^}]+)\}/)?.[1];
  assert.ok(sectionRule);
  assert.doesNotMatch(sectionRule, /position:\s*(sticky|fixed)/);
  for (const page of ["index.html", "skills.html", "docs.html", "ranking-method.css"]) {
    const content = await read(`web/public/${page}`);
    assert.doesNotMatch(content, /(?:^|[;\s])top: 62px;/, page);
    assert.doesNotMatch(content, /scroll-margin-top: \d+px;/, page);
    assert.ok(content.includes("top: var(--site-header-height)"), page);
  }
  const sitemap = await read("web/public/sitemap.xml");
  assert.ok(!sitemap.includes("?page="), "client-side views share the catalog canonical URL");
});


test("Top100 pages share one header and footer and retain their section navigation", async () => {
  const pages = await Promise.all(["index.html", "skills.html", "docs.html"].map((file) =>
    readFile(new URL(`web/public/${file}`, repo), "utf8")));
  const normalize = (value) => value.replace(/\s+/g, " ").trim();
  const header = (html) => html.match(/<header class="dsh-site-header">[\s\S]*?<\/header>/)?.[0];
  const footer = (html) => html.match(/<footer class="dsh-site-footer">[\s\S]*?<\/footer>/)?.[0];
  for (const html of pages) {
    assert.ok(header(html));
    assert.ok(footer(html));
    assert.equal(normalize(header(html)), normalize(header(pages[0])));
    assert.equal(normalize(footer(html)), normalize(footer(pages[0])));
    assert.equal((html.match(/<main\b/g) ?? []).length, 1);
    assert.match(html, /<main[^>]*>\s*<nav class="top100-section-nav"/);
    const section = html.match(/<nav class="top100-section-nav"[\s\S]*?<\/nav>/)[0];
    for (const label of ["插件榜单", "Skills 榜单", "安装指南", "排名方法", "GitHub"]) assert.ok(section.includes(label));
    assert.match(section, /<img src="\.\/assets\/dsh-top100-mark\.svg" width="28" height="28" alt=""/);
    assert.ok(section.includes("<span>dsh-top100</span>"));
    assert.ok(header(html).indexOf(">首页</a>") < header(html).indexOf(">Top100</a>"));
    assert.ok(header(html).indexOf(">Top100</a>") < header(html).indexOf(">评测结果</a>"));
    assert.ok(!html.includes('class="nav-shell"'));
    assert.match(html, /href="\.\/site-chrome\.css\?v=20260905-type8c" \/>\s*<\/head>/);
  }
  assert.match(pages[0], /class="nav-links">[\s\S]*?data-content-switch="ranking"/);
  const layout = pages[2].slice(pages[2].indexOf('<div class="docs-layout">'), pages[2].indexOf("</main>"));
  assert.ok(!layout.includes("dsh-site-header") && !layout.includes("top100-section-nav"));
});
