import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_EVENTS,
  buildAnalyticsUrl,
  createAnalyticsClient,
  createAnalyticsPayload,
  sanitizeAnalyticsProperties,
} from "../public/analytics.js";

const origin = "https://www.dsheval.ai";
const sessionId = "s_12345678-1234-4123-8123-123456789abc";

test("exports only the approved event names", () => {
  assert.deepEqual(ANALYTICS_EVENTS, [
    "page_view",
    "search_used",
    "ranking_view_changed",
    "category_selected",
    "plugin_github_click",
    "plugin_link_copy",
    "install_guide_open",
    "install_command_copy",
  ]);
  assert.equal(sanitizeAnalyticsProperties("not_allowed", {}, { origin }), null);
});

test("keeps coarse event properties and strips sensitive or unknown values", () => {
  const properties = sanitizeAnalyticsProperties(
    "plugin_github_click",
    {
      view: "top100",
      category: "tools",
      plugin: "openai/codex",
      rank: 12,
      path: "/plugins?query=private-search#result",
      query: "private-search",
      referrer: "https://search.example/private",
      ip: "192.0.2.1",
      userAgent: "full browser fingerprint",
      arbitrary: "not sent",
    },
    { origin },
  );

  assert.deepEqual(properties, {
    view: "top100",
    category: "tools",
    plugin: "openai/codex",
    rank: 12,
    path: "/plugins",
  });
});

test("rejects free-form dimensions, private plugin values and cross-origin paths", () => {
  const properties = sanitizeAnalyticsProperties(
    "search_used",
    {
      view: "my original search",
      category: "custom secret category",
      plugin: "not/allowed/here",
      rank: "4",
      path: "https://other.example/private?q=secret",
    },
    { origin },
  );

  assert.deepEqual(properties, {});
});

test("applies per-event property allowlists", () => {
  assert.deepEqual(
    sanitizeAnalyticsProperties(
      "page_view",
      { view: "home", category: "ai", plugin: "openai/codex", rank: 1 },
      { origin, pathname: "/" },
    ),
    { view: "home", path: "/" },
  );
});

test("builds a same-origin query-only event URL", () => {
  const payload = createAnalyticsPayload(
    "install_command_copy",
    {
      view: "dsh",
      plugin: "owner/repo.with-dash",
      rank: 8,
      path: "/dsh.html?command=secret#install",
      command: "npm install secret",
    },
    { origin, pathname: "/", sessionId },
  );
  const eventUrl = buildAnalyticsUrl(payload, origin);
  const parsed = new URL(eventUrl);

  assert.equal(parsed.origin, origin);
  assert.equal(parsed.pathname, "/api/events");
  assert.deepEqual(Object.fromEntries(parsed.searchParams), {
    event: "install_command_copy",
    session: sessionId,
    view: "dsh",
    plugin: "owner/repo.with-dash",
    rank: "8",
    path: "/dsh.html",
  });
  assert.equal(eventUrl.includes("secret"), false);
  assert.equal(parsed.searchParams.has("command"), false);
  assert.match(eventUrl, /plugin=owner\/repo\.with-dash/);
  assert.match(eventUrl, /path=\/dsh\.html/);
});

test("re-sanitizes payloads passed directly to the URL builder", () => {
  const eventUrl = buildAnalyticsUrl(
    {
      event: "search_used",
      session: sessionId,
      view: "raw secret query",
      category: "ai",
      plugin: "private/value",
      query: "secret",
      path: "/?query=secret",
    },
    origin,
  );
  const params = Object.fromEntries(new URL(eventUrl).searchParams);

  assert.deepEqual(params, {
    event: "search_used",
    session: sessionId,
    category: "ai",
    path: "/",
  });
});

test("reuses a random session id from sessionStorage", () => {
  const values = new Map();
  const runtime = {
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  const firstClient = createAnalyticsClient(runtime);
  const first = firstClient.getSessionId();
  const secondClient = createAnalyticsClient(runtime);
  assert.equal(first, "s_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assert.equal(secondClient.getSessionId(), first);
});

test("continues with an in-memory session when storage is unavailable", () => {
  const runtime = {
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    get sessionStorage() {
      throw new Error("storage denied");
    },
  };
  const client = createAnalyticsClient(runtime);

  assert.equal(client.getSessionId(), client.getSessionId());
  assert.match(client.getSessionId(), /^s_/);
});

test("uses privacy-restricted fetch even when Beacon is available", () => {
  const calls = [];
  const runtime = {
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    location: { origin, pathname: "/" },
    navigator: {
      sendBeacon() {
        assert.fail("Beacon must not bypass credential and referrer controls");
      },
    },
    fetch(url, options) {
      calls.push({ url, options });
      return Promise.resolve({ ok: true });
    },
  };

  assert.equal(createAnalyticsClient(runtime).pageView({ view: "home" }), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/www\.dsheval\.ai\/api\/events\?/);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.referrerPolicy, "no-referrer");
});

test("uses keepalive fetch without sending private search values", async () => {
  const calls = [];
  const runtime = {
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    location: { origin, pathname: "/ranking?query=not-visible" },
    navigator: {},
    fetch(url, options) {
      calls.push({ url, options });
      return Promise.resolve({ ok: true });
    },
  };

  assert.equal(createAnalyticsClient(runtime).track("search_used", { view: "search", query: "secret" }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.referrerPolicy, "no-referrer");
  assert.equal(calls[0].url.includes("secret"), false);
  assert.equal(new URL(calls[0].url).searchParams.get("path"), "/ranking");
});

test("silently declines invalid events or unavailable transports", () => {
  const runtime = {
    crypto: { randomUUID: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    location: { origin, pathname: "/" },
    navigator: {},
  };
  const client = createAnalyticsClient(runtime);

  assert.equal(client.track("search_query", { query: "private" }), false);
  assert.equal(client.track("page_view"), false);
});
