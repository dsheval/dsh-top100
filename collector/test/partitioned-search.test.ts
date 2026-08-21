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
