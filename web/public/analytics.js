const EVENTS = Object.freeze([
  "page_view",
  "search_used",
  "ranking_view_changed",
  "category_selected",
  "plugin_github_click",
  "plugin_link_copy",
  "install_guide_open",
  "install_command_copy",
]);

const EVENT_SET = new Set(EVENTS);

const EVENT_PROPERTIES = Object.freeze({
  page_view: Object.freeze(["view", "path"]),
  search_used: Object.freeze(["view", "category", "path"]),
  ranking_view_changed: Object.freeze(["view", "category", "path"]),
  category_selected: Object.freeze(["view", "category", "path"]),
  plugin_github_click: Object.freeze(["view", "category", "plugin", "rank", "path"]),
  plugin_link_copy: Object.freeze(["view", "category", "plugin", "rank", "path"]),
  install_guide_open: Object.freeze(["view", "plugin", "path"]),
  install_command_copy: Object.freeze(["view", "category", "plugin", "rank", "path"]),
});

const VIEWS = new Set([
  "home",
  "top100",
  "hot",
  "rising",
  "all",
  "total",
  "category",
  "search",
  "dsh",
]);

const CATEGORIES = new Set([
  "ai",
  "appearance",
  "coding",
  "knowledge",
  "tools",
  "security",
]);

const ENDPOINT_PATH = "/api/events";
const SESSION_KEY = "dsh_analytics_session";
const SESSION_ID_PATTERN = /^s_[A-Za-z0-9_-]{12,64}$/;
const PLUGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

function safeOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

function sanitizePath(value, origin) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname.length > 256) return null;
    return url.pathname || "/";
  } catch {
    return null;
  }
}

function sanitizePlugin(value) {
  if (typeof value !== "string") return null;
  const plugin = value.trim();
  return PLUGIN_PATTERN.test(plugin) ? plugin : null;
}

function sanitizeRank(value) {
  const rank = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(rank) && rank > 0 && rank <= 1_000_000 ? rank : null;
}

function sanitizeView(value) {
  return typeof value === "string" && VIEWS.has(value) ? value : null;
}

function sanitizeCategory(value) {
  return typeof value === "string" && CATEGORIES.has(value) ? value : null;
}

/**
 * Keep analytics properties deliberately coarse. Unknown keys (including query,
 * referrer, IP and user-agent values) never make it into the returned object.
 */
export function sanitizeAnalyticsProperties(event, properties = {}, context = {}) {
  if (!EVENT_SET.has(event)) return null;
  const source = properties && typeof properties === "object" ? properties : {};
  const allowed = EVENT_PROPERTIES[event];
  const origin = safeOrigin(context.origin);
  const result = {};

  if (allowed.includes("view")) {
    const view = sanitizeView(source.view);
    if (view) result.view = view;
  }

  if (allowed.includes("category")) {
    const category = sanitizeCategory(source.category);
    if (category) result.category = category;
  }

  if (allowed.includes("plugin")) {
    const plugin = sanitizePlugin(source.plugin);
    if (plugin) result.plugin = plugin;
  }

  if (allowed.includes("rank")) {
    const rank = sanitizeRank(source.rank);
    if (rank) result.rank = rank;
  }

  if (allowed.includes("path") && origin) {
    const path = sanitizePath(source.path ?? context.pathname ?? "/", origin);
    if (path) result.path = path;
  }

  return result;
}

export function createAnalyticsPayload(event, properties, context) {
  if (!EVENT_SET.has(event) || !SESSION_ID_PATTERN.test(context?.sessionId ?? "")) {
    return null;
  }
  const sanitized = sanitizeAnalyticsProperties(event, properties, context);
  if (!sanitized) return null;
  return { event, session: context.sessionId, ...sanitized };
}

export function buildAnalyticsUrl(payload, origin) {
  const safe = safeOrigin(origin);
  if (!safe || !payload || !EVENT_SET.has(payload.event)) return null;
  if (!SESSION_ID_PATTERN.test(payload.session ?? "")) return null;

  const properties = sanitizeAnalyticsProperties(payload.event, payload, {
    origin: safe,
    pathname: "/",
  });

  const url = new URL(ENDPOINT_PATH, safe);
  url.searchParams.set("event", payload.event);
  url.searchParams.set("session", payload.session);
  for (const key of ["view", "category", "plugin", "rank", "path"]) {
    if (properties[key] !== undefined) url.searchParams.set(key, String(properties[key]));
  }
  // Nginx `$arg_*` variables preserve percent encoding. These slashes have
  // already passed the plugin/path allowlists and remain valid in a query.
  return url.href.replace(/%2F/gi, "/");
}

function randomSessionId(runtime) {
  try {
    if (typeof runtime.crypto?.randomUUID === "function") {
      return `s_${runtime.crypto.randomUUID()}`;
    }
    if (typeof runtime.crypto?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      runtime.crypto.getRandomValues(bytes);
      return `s_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {
    // Fall through to a per-tab, non-cryptographic identifier for old browsers.
  }
  const time = Date.now().toString(36);
  const random = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `s_${time}_${random}`;
}

function sessionStorageFor(runtime) {
  try {
    return runtime.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function send(url, runtime) {
  try {
    if (typeof runtime.fetch !== "function") return false;
    const request = runtime.fetch(url, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      mode: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    Promise.resolve(request).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function createAnalyticsClient(runtime = globalThis) {
  let memorySessionId = null;

  function getSessionId() {
    if (memorySessionId) return memorySessionId;
    const storage = sessionStorageFor(runtime);
    try {
      const stored = storage?.getItem(SESSION_KEY);
      if (stored && SESSION_ID_PATTERN.test(stored)) {
        memorySessionId = stored;
        return memorySessionId;
      }
    } catch {
      // Storage can be denied in private or hardened browsing modes.
    }

    memorySessionId = randomSessionId(runtime);
    try {
      storage?.setItem(SESSION_KEY, memorySessionId);
    } catch {
      // The in-memory identifier still keeps events coherent for this page load.
    }
    return memorySessionId;
  }

  function track(event, properties = {}) {
    let location;
    try {
      location = runtime.location;
    } catch {
      return false;
    }
    const origin = safeOrigin(location?.origin);
    if (!origin) return false;

    const payload = createAnalyticsPayload(event, properties, {
      origin,
      pathname: location.pathname,
      sessionId: getSessionId(),
    });
    const url = buildAnalyticsUrl(payload, origin);
    return url ? send(url, runtime) : false;
  }

  return Object.freeze({
    getSessionId,
    track,
    pageView(properties = {}) {
      return track("page_view", properties);
    },
  });
}

export const ANALYTICS_EVENTS = EVENTS;
export const analytics = createAnalyticsClient();
export const track = analytics.track;
export const trackPageView = analytics.pageView;

export default analytics;
