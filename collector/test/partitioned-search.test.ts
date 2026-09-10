import { describe, expect, it, vi } from "vitest";
import type { GithubRepo, GithubSearchResult } from "../src/github.js";
import {
  partitionedRepositorySearch,
  RepositorySearchIncompleteError,
} from "../src/sources/github-partitioned-search.js";

function repo(id: number): GithubRepo {
  return {
    id,
    node_id: `R_${id}`,
    full_name: `owner/repo-${id}`,
    name: `repo-${id}`,
    owner: { login: "owner" },
    description: null,
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    pushed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    default_branch: "main",
    archived: false,
    fork: false,
  };
}

function page(items: GithubRepo[], pageNumber: number, pageSize: number): GithubSearchResult {
  const from = (pageNumber - 1) * pageSize;
  return {
    total_count: items.length,
    incomplete_results: false,
    items: items.slice(from, from + pageSize),
  };
}

describe("partitionedRepositorySearch", () => {
  it("recursively splits 1001 results by creation time without losing repositories", async () => {
    const left = Array.from({ length: 600 }, (_, index) => repo(index + 1));
    const right = Array.from({ length: 401 }, (_, index) => repo(index + 601));
    const request = vi.fn(async (query: string, pageNumber: number, pageSize: number) => {
      if (query.includes("00:00:00Z..2026-01-01T00:00:01Z")) {
        return page([...left, ...right], pageNumber, pageSize);
      }
      return page(
        query.includes("00:00:00Z..2026-01-01T00:00:00Z") ? left : right,
        pageNumber,
        pageSize
      );
    });

    const result = await partitionedRepositorySearch("topic:dsh-plugin", {
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-01T00:00:01Z"),
      request,
      semanticRetries: 0,
      retryDelayMs: 0,
    });

    expect(result.repositories).toHaveLength(1001);
    expect(new Set(result.repositories.map((item) => item.id)).size).toBe(1001);
    expect(result.audit.shards).toBe(2);
  });

  it("splits an overloaded single second into stars buckets", async () => {
    const zeroStars = Array.from({ length: 500 }, (_, index) => repo(index + 1));
    const lowStars = Array.from({ length: 501 }, (_, index) => repo(index + 501));
    const request = vi.fn(async (query: string, pageNumber: number, pageSize: number) => {
      if (!query.includes("stars:")) {
        return page([...zeroStars, ...lowStars], pageNumber, pageSize);
      }
      if (query.includes("stars:0")) return page(zeroStars, pageNumber, pageSize);
      if (query.includes("stars:1..5")) return page(lowStars, pageNumber, pageSize);
      return page([], pageNumber, pageSize);
    });

    const result = await partitionedRepositorySearch("topic:dsh-plugin", {
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-01T00:00:00Z"),
      request,
      semanticRetries: 0,
      retryDelayMs: 0,
    });

    expect(result.repositories).toHaveLength(1001);
    expect(result.audit.shards).toBe(6);
  });

  it("rejects persistently incomplete GitHub responses", async () => {
    const request = vi.fn(async () => ({
      total_count: 1,
      incomplete_results: true,
      items: [repo(1)],
    }));

    await expect(
      partitionedRepositorySearch("topic:dsh-plugin", {
        request,
        semanticRetries: 1,
        retryDelayMs: 0,
      })
    ).rejects.toBeInstanceOf(RepositorySearchIncompleteError);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects pagination that returns fewer identities than the probe promised", async () => {
    const request = vi.fn(async (_query: string, _page: number, pageSize: number) => ({
      total_count: 2,
      incomplete_results: false,
      items: pageSize === 1 ? [repo(1)] : [repo(1)],
    }));

    await expect(
      partitionedRepositorySearch("topic:dsh-plugin", {
        request,
        semanticRetries: 0,
        retryDelayMs: 0,
      })
    ).rejects.toBeInstanceOf(RepositorySearchIncompleteError);
  });
});

describe("Repository Search partial recovery", () => {
  it("retains observed pages and the failed request when the next page times out", async () => {
    const request = vi.fn(async (_query: string, pageNumber: number, pageSize: number) => {
      if (pageNumber === 2) throw new Error("timeout");
      return { total_count: 3, incomplete_results: false, items: [repo(1), repo(2)].slice(0, pageSize) };
    });
    await expect(partitionedRepositorySearch("topic:dsh-plugin", {
      request, perPage: 2, semanticRetries: 0,
    })).rejects.toMatchObject({
      name: "SearchPartialError",
      partial: { repositories: [repo(1), repo(2)], audit: { requests: 3, repositories: 2, shards: 0 } },
    });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("retains identities even when complete pagination cannot be proved", async () => {
    await expect(partitionedRepositorySearch("topic:dsh-plugin", {
      request: async () => ({ total_count: 2, incomplete_results: false, items: [repo(1)] }),
      semanticRetries: 0,
    })).rejects.toMatchObject({
      name: "RepositorySearchIncompleteError",
      partial: { repositories: [repo(1)], audit: { requests: 2, repositories: 1, shards: 0 } },
    });
  });

  it("retains candidates returned in persistently incomplete responses", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ total_count: 2, incomplete_results: true, items: [repo(1)] })
      .mockResolvedValueOnce({ total_count: 2, incomplete_results: true, items: [repo(2)] });
    await expect(partitionedRepositorySearch("topic:dsh-plugin", {
      request, semanticRetries: 1, retryDelayMs: 0,
    })).rejects.toMatchObject({
      name: "RepositorySearchIncompleteError",
      partial: { repositories: [repo(1), repo(2)], audit: { requests: 2, repositories: 2, shards: 0 } },
    });
  });

  it("reports one attempted request when no response was read", async () => {
    await expect(partitionedRepositorySearch("topic:dsh-plugin", {
      request: async () => { throw new Error("network"); },
    })).rejects.toMatchObject({
      partial: { repositories: [], audit: { requests: 1, repositories: 0, shards: 0 } },
    });
  });
});

describe("partition failure after completed shards", () => {
  it("preserves completed leaves and candidates observed in the failing shard", async () => {
    const request = vi.fn(async (query: string, _page: number, pageSize: number) => {
      if (query.includes("00:00:00Z..2026-01-01T00:00:01Z")) {
        return { total_count: 3, incomplete_results: false, items: [repo(1)] };
      }
      if (query.includes("00:00:00Z..2026-01-01T00:00:00Z")) {
        return { total_count: 1, incomplete_results: false, items: [repo(1)] };
      }
      if (pageSize === 1) return { total_count: 2, incomplete_results: false, items: [repo(2)] };
      throw new Error("timeout");
    });
    await expect(partitionedRepositorySearch("topic:dsh-plugin", {
      from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-01T00:00:01Z"),
      maxItemsPerShard: 2, perPage: 2, request, semanticRetries: 0,
    })).rejects.toMatchObject({
      partial: { repositories: [repo(1), repo(2)], audit: { repositories: 2, requests: 5, shards: 1 } },
    });
  });
});
