/**
 * GitHub API 客户端（轻量 fetch 封装）
 * - 自动带 token（GITHUB_TOKEN 环境变量）
 * - 简单重试（429/5xx）
 * - 返回 typed 数据
 */

const API_BASE = "https://api.github.com";

export class GithubError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  accept?: string; // 例如 raw 用于 README
}

export async function githubFetch<T>(
  path: string,
  opts: RequestOptions = {},
  maxRetries = 3
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "dsh-market-collector",
        Accept: opts.accept ?? "application/vnd.github+json",
      };
      const token = process.env.GITHUB_TOKEN;
      if (token) headers.Authorization = `token ${token}`;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

      if (res.status === 403 || res.status === 429) {
        // GitHub 限流两种形式：
        // 1) 主限流：x-ratelimit-reset（时间戳）
        // 2) secondary rate limit：Retry-After（秒）——403 无 x-ratelimit-reset 时常见
        const retryAfter = res.headers.get("retry-after");
        const reset = res.headers.get("x-ratelimit-reset");
        let waitMs = 0;
        if (retryAfter) {
          waitMs = Number(retryAfter) * 1000 + 500;
        } else if (reset) {
          waitMs = Math.min(Number(reset) * 1000 - Date.now() + 1000, 60_000);
        } else if (res.status === 429) {
          waitMs = 5000; // 429 无 header：保守等待后重试
        }
        if (waitMs > 0) {
          await sleep(Math.min(waitMs, 60_000));
          continue;
        }
        // 403 且无任何限流 header：视为普通权限错误，不重试
        throw new GithubError(`GitHub API ${res.status}`, res.status, url);
      }

      if (!res.ok) {
        throw new GithubError(`GitHub API ${res.status}`, res.status, url);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      lastError = err as Error;
      if (err instanceof GithubError && err.status < 500 && err.status !== 429) {
        throw err; // 4xx 不重试
      }
      // 网络错误/5xx：指数退避重试
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}

/** 拉取仓库指定目录的文件列表（用于特征检测） */
export async function fetchRepoRoot(
  fullName: string,
  branch?: string | null,
  dirPath = ""
): Promise<RepoContentItem[]> {
  const dir = dirPath ? `/${dirPath}` : "";
  const path = `/repos/${fullName}/contents${dir}${branch ? `?ref=${branch}` : ""}`;
  try {
    const items = await githubFetch<RepoContentItem[]>(path);
    return Array.isArray(items) ? items : [];
  } catch (err) {
    if (err instanceof GithubError && err.status === 404) return [];
    throw err;
  }
}

/** 拉取 raw 文件内容（README/SKILL.md/package.json 等，限 1MB） */
export async function fetchRawFile(
  fullName: string,
  filePath: string,
  branch?: string | null
): Promise<string | null> {
  const ref = branch ? `?ref=${branch}` : "";
  const url = `https://raw.githubusercontent.com/${fullName}/${branch ? branch : "HEAD"}/${filePath}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "dsh-market-collector" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 1_000_000 ? text.slice(0, 1_000_000) : text;
  } catch {
    return null;
  }
}

/** 通过 contents API 读取小文件（分支无关，支持默认分支） */
export async function fetchFileViaApi(
  fullName: string,
  filePath: string
): Promise<{ content: string; sha: string } | null> {
  try {
    const data = await githubFetch<{ content: string; sha: string }>(
      `/repos/${fullName}/contents/${filePath}`
    );
    if (!data?.content) return null;
    return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
  } catch {
    return null;
  }
}

/** 分页遍历 */
export async function paginate<T>(
  path: string,
  perPage = 100,
  maxPages = 10
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const items = await githubFetch<T[]>(`${path}${sep}per_page=${perPage}&page=${page}`);
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- 类型 ----------

export interface RepoContentItem {
  name: string;
  path: string;
  type: "file" | "dir" | "submodule" | "symlink";
  size: number;
}

export interface GithubRepo {
  id: number;
  node_id?: string;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  homepage: string | null;
  license: { spdx_id: string | null } | null;
  topics: string[];
  pushed_at: string;
  created_at: string;
  updated_at: string;
  default_branch: string | null;
  archived: boolean;
  fork: boolean;
}

export interface GithubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GithubRepo[];
}

export interface GithubCodeRepository {
  id: number;
  node_id?: string;
  full_name: string;
}

export interface GithubCodeSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{ repository: GithubCodeRepository }>;
}
