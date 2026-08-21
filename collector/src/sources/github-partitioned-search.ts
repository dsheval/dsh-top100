/** Complete GitHub Repository Search through deterministic query partitioning. */

import {
  githubFetch,
  sleep,
  type GithubRepo,
  type GithubSearchResult,
} from "../github.js";

const DEFAULT_FROM = Math.floor(Date.parse("2008-01-01T00:00:00Z") / 1000);
const DEFAULT_MAX_ITEMS = 900;
const DEFAULT_PER_PAGE = 100;
const STAR_BUCKETS = ["0", "1..5", "6..20", "21..100", "101..1000", ">1000"];
const SIZE_BUCKETS = [
  "0..10",
  "11..100",
  "101..1000",
  "1001..10000",
  "10001..100000",
  ">100000",
];

export interface RepositorySearchRequest {
  (query: string, page: number, perPage: number): Promise<GithubSearchResult>;
}

export interface PartitionedSearchOptions {
  from?: Date;
  to?: Date;
  maxItemsPerShard?: number;
  perPage?: number;
  semanticRetries?: number;
  retryDelayMs?: number;
  request?: RepositorySearchRequest;
}

export interface PartitionedSearchAudit {
  query: string;
  requests: number;
  shards: number;
  repositories: number;
}

export interface PartitionedSearchResult {
  repositories: GithubRepo[];
  audit: PartitionedSearchAudit;
}

interface SearchShard {
  from: number;
  to: number;
  stars?: string;
  size?: string;
}

/** Raised when GitHub reports an incomplete or unsplittable result set. */
export class RepositorySearchIncompleteError extends Error {}

let lastRepositorySearchAt = 0;

async function throttleRepositorySearch(): Promise<void> {
  const interval = Number(process.env.DSH_REPOSITORY_SEARCH_INTERVAL_MS ?? "2200");
  const wait = Math.max(0, lastRepositorySearchAt + interval - Date.now());
  if (wait > 0) await sleep(wait);
  lastRepositorySearchAt = Date.now();
}

/** Execute one authenticated Repository Search API request. */
export async function requestGithubRepositories(
  query: string,
  page: number,
  perPage: number
): Promise<GithubSearchResult> {
  await throttleRepositorySearch();
  const params = new URLSearchParams({
    q: query,
    sort: "stars",
    order: "desc",
    page: String(page),
    per_page: String(perPage),
  });
  return githubFetch<GithubSearchResult>(`/search/repositories?${params.toString()}`);
}

function formatSecond(value: number): string {
  return new Date(value * 1000).toISOString().replace(".000Z", "Z");
}

function shardQuery(baseQuery: string, shard: SearchShard): string {
  const qualifiers = [
    `created:${formatSecond(shard.from)}..${formatSecond(shard.to)}`,
  ];
  if (shard.stars) qualifiers.push(`stars:${shard.stars}`);
  if (shard.size) qualifiers.push(`size:${shard.size}`);
  return `${baseQuery} ${qualifiers.join(" ")}`;
}

function repositoryIdentity(repo: GithubRepo): string {
  return repo.node_id ? `node:${repo.node_id}` : `id:${repo.id}`;
}

/** Search every result for one base query without accepting GitHub's 1,000-result truncation. */
export async function partitionedRepositorySearch(
  baseQuery: string,
  options: PartitionedSearchOptions = {}
): Promise<PartitionedSearchResult> {
  const request = options.request ?? requestGithubRepositories;
  const maxItems = options.maxItemsPerShard ?? DEFAULT_MAX_ITEMS;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const semanticRetries = options.semanticRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const from = Math.floor((options.from?.getTime() ?? DEFAULT_FROM * 1000) / 1000);
  const to = Math.floor((options.to?.getTime() ?? Date.now()) / 1000);
  if (from > to) throw new Error("Repository Search start time must not exceed end time");

  let requests = 0;
  let leafShards = 0;
  const repositories = new Map<string, GithubRepo>();

  const stableRequest = async (
    query: string,
    page: number,
    requestedPerPage: number
  ): Promise<GithubSearchResult> => {
    for (let attempt = 0; attempt <= semanticRetries; attempt++) {
      requests++;
      const response = await request(query, page, requestedPerPage);
      if (!response.incomplete_results) return response;
      if (attempt < semanticRetries && retryDelayMs > 0) await sleep(retryDelayMs);
    }
    throw new RepositorySearchIncompleteError(
      `GitHub returned incomplete Repository Search results for: ${query}`
    );
  };

  const collectLeaf = async (
    query: string,
    expectedTotal: number
  ): Promise<void> => {
    for (let attempt = 0; attempt <= semanticRetries; attempt++) {
      const collected = new Map<string, GithubRepo>();
      const pages = Math.ceil(expectedTotal / perPage);
      for (let page = 1; page <= pages; page++) {
        const response = await stableRequest(query, page, perPage);
        for (const repo of response.items) {
          collected.set(repositoryIdentity(repo), repo);
        }
      }
      if (collected.size >= expectedTotal) {
        for (const [key, repo] of collected) repositories.set(key, repo);
        leafShards++;
        return;
      }
      if (attempt < semanticRetries && retryDelayMs > 0) await sleep(retryDelayMs);
    }
    throw new RepositorySearchIncompleteError(
      `Repository Search pagination returned fewer identities than promised for: ${query}`
    );
  };

  const visit = async (shard: SearchShard): Promise<void> => {
    const query = shardQuery(baseQuery, shard);
    const probe = await stableRequest(query, 1, 1);
    if (probe.total_count <= maxItems) {
      if (probe.total_count > 0) await collectLeaf(query, probe.total_count);
      else leafShards++;
      return;
    }

    if (shard.from < shard.to) {
      const midpoint = Math.floor((shard.from + shard.to) / 2);
      await visit({ ...shard, to: midpoint });
      await visit({ ...shard, from: midpoint + 1 });
      return;
    }

    if (!shard.stars) {
      for (const stars of STAR_BUCKETS) await visit({ ...shard, stars });
      return;
    }

    if (!shard.size) {
      for (const size of SIZE_BUCKETS) await visit({ ...shard, size });
      return;
    }

    throw new RepositorySearchIncompleteError(
      `Repository Search shard still exceeds ${maxItems} results: ${query}`
    );
  };

  await visit({ from, to });
  return {
    repositories: [...repositories.values()],
    audit: {
      query: baseQuery,
      requests,
      shards: leafShards,
      repositories: repositories.size,
    },
  };
}
