/** One authority and selector parser for repository metadata and persisted GitHub sources. */
export interface GitHubSource {
  repository: string;
  ref: string | null;
  path: string | null;
}

const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
const PORTS: Record<string, string> = { "https:": "443", "http:": "80", "ssh:": "22", "git:": "9418" };

export function parseGitHubSource(value: unknown, purpose: "install" | "repository" = "install"): GitHubSource | null {
  if (typeof value !== "string") return null;
  let source = value.trim().replace(/^git\+/i, "");
  if (!source || source.length > 2048 || /[\\\s]/.test(source)) return null;
  let repository: string;
  let selector = "";
  if (/^github:/i.test(source) || REPOSITORY.test(source.split("#")[0].replace(/\.git$/i, ""))) {
    const parts = source.replace(/^github:/i, "").split("#");
    if (parts.length > 2) return null;
    repository = parts[0].replace(/\.git$/i, "");
    selector = parts[1] ?? "";
  } else {
    source = source.replace(/^git@github\.com:/i, "ssh://git@github.com/");
    let url: URL;
    try { url = new URL(source); } catch { return null; }
    if (!Object.hasOwn(PORTS, url.protocol) || url.hostname.toLowerCase() !== "github.com") return null;
    if ((url.port && url.port !== PORTS[url.protocol]) || url.search || url.password) return null;
    if (url.username && !(url.protocol === "ssh:" && url.username === "git")) return null;
    // Check raw path segments too: URL's dot-segment normalization must not hide an ambiguous source.
    const rawPath = source.replace(/^[^:]+:\/\/[^/]+/, "").split("#")[0];
    if (rawPath.split("/").some((part) => part === "." || part === ".." || /%/i.test(part))) return null;
    const match = /^\/([^/]+)\/([^/]+?)(?:\.git)?(\/.*)?$/i.exec(url.pathname);
    if (!match) return null;
    if (purpose === "install" && match[3] && match[3] !== "/") return null;
    repository = `${match[1]}/${match[2]}`;
    selector = url.hash.slice(1);
  }
  if (!REPOSITORY.test(repository)) return null;
  if (purpose === "repository") return { repository: repository.toLowerCase(), ref: null, path: null };
  let ref: string | null = null;
  let path: string | null = null;
  for (const parameter of selector ? selector.split("&") : []) {
    if (parameter.startsWith("path:")) {
      if (path !== null) return null;
      path = parameter.slice(5).replace(/^\/+|\/+$/g, "");
      if (!path || !/^[A-Za-z0-9@._/-]+$/.test(path)
        || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;
    } else {
      if (ref !== null || !/^[A-Za-z0-9._~+/:=-]+$/.test(parameter)) return null;
      ref = parameter;
    }
  }
  return { repository: repository.toLowerCase(), ref, path };
}

export function githubRepositoryIdentity(value: unknown): string | null {
  const url = value !== null && typeof value === "object" ? (value as { url?: unknown }).url : value;
  return parseGitHubSource(url, "repository")?.repository ?? null;
}

export function githubInstallTarget(source: GitHubSource): string {
  const selector = [source.ref, source.path ? `path:/${source.path}` : null].filter(Boolean).join("&");
  return `github:${source.repository}${selector ? `#${selector}` : ""}`;
}
