/** GitHub Code Search candidate discovery for DSH-specific marker files and dependencies. */

import {
  githubFetch,
  sleep,
  type GithubCodeRepository,
  type GithubCodeSearchResult,
} from "../github.js";
import { RepositorySearchIncompleteError } from "./github-partitioned-search.js";

export interface CodeSearchRequest {
  (query: string, page: number, perPage: number): Promise<GithubCodeSearchResult>;
}

export interface CodeSearchOptions {
  maxItems?: number;
  perPage?: number;
  semanticRetries?: number;
  retryDelayMs?: number;
  request?: CodeSearchRequest;
}

export interface CodeSearchResult {
  repositories: GithubCodeRepository[];
  requests: number;
  matches: number;
  totalMatches: number;
  complete: boolean;
}

let lastCodeSearchAt = 0;

async function throttleCodeSearch(): Promise<void> {
  const interval = Number(process.env.DSH_CODE_SEARCH_INTERVAL_MS ?? "6500");
  const wait = Math.max(0, lastCodeSearchAt + interval - Date.now());
  if (wait > 0) await sleep(wait);
  lastCodeSearchAt = Date.now();
}

/** Execute one authenticated Code Search API request. */
export async function requestGithubCode(
  query: string,
  page: number,
  perPage: number
): Promise<GithubCodeSearchResult> {
  await throttleCodeSearch();
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    per_page: String(perPage),
  });
  return githubFetch<GithubCodeSearchResult>(`/search/code?${params.toString()}`);
}

function identity(repo: GithubCodeRepository): string {
  return repo.node_id ? `node:${repo.node_id}` : `id:${repo.id}`;
}

/** Collect the accessible Code Search window and report whether it covers every match. */
export async function searchCodeRepositories(
  query: string,
  options: CodeSearchOptions = {}
): Promise<CodeSearchResult> {
  const request = options.request ?? requestGithubCode;
  const maxItems = options.maxItems ?? 900;
  const perPage = options.perPage ?? 100;
  const retries = options.semanticRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  let requests = 0;

  const stableRequest = async (page: number, size: number): Promise<GithubCodeSearchResult> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      requests++;
      const response = await request(query, page, size);
      if (!response.incomplete_results) return response;
      if (attempt < retries && retryDelayMs > 0) await sleep(retryDelayMs);
    }
    throw new RepositorySearchIncompleteError(
      `GitHub returned incomplete Code Search results for: ${query}`
    );
  };

  const probe = await stableRequest(1, 1);
  const targetMatches = Math.min(probe.total_count, maxItems);

  const repositories = new Map<string, GithubCodeRepository>();
  let matches = 0;
  for (let page = 1; page <= Math.ceil(targetMatches / perPage); page++) {
    const response = await stableRequest(page, perPage);
    const remaining = targetMatches - matches;
    const items = response.items.slice(0, remaining);
    matches += items.length;
    for (const item of items) {
      repositories.set(identity(item.repository), item.repository);
    }
  }
  return {
    repositories: [...repositories.values()],
    requests,
    matches,
    totalMatches: probe.total_count,
    complete: probe.total_count <= maxItems && matches >= targetMatches,
  };
}
