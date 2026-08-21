import { describe, expect, it, vi } from "vitest";
import type { GithubCodeSearchResult } from "../src/github.js";
import { searchCodeRepositories } from "../src/sources/github-code-search.js";

function response(
  total: number,
  repositories: Array<{ id: number; node_id: string; full_name: string }>,
  incomplete = false
): GithubCodeSearchResult {
  return {
    total_count: total,
    incomplete_results: incomplete,
    items: repositories.map((repository) => ({ repository })),
  };
}

describe("searchCodeRepositories", () => {
  it("collects every code match and deduplicates repositories by identity", async () => {
    const matches = [
      { id: 1, node_id: "R_1", full_name: "a/one" },
      { id: 1, node_id: "R_1", full_name: "a/one" },
      { id: 2, node_id: "R_2", full_name: "b/two" },
    ];
    const request = vi.fn(async (_query: string, _page: number, perPage: number) =>
      response(3, perPage === 1 ? matches.slice(0, 1) : matches)
    );

    const result = await searchCodeRepositories("path:cordis.patch.yml", {
      request,
      semanticRetries: 0,
      retryDelayMs: 0,
    });

    expect(result.matches).toBe(3);
    expect(result.totalMatches).toBe(3);
    expect(result.complete).toBe(true);
    expect(result.repositories.map((repo) => repo.full_name)).toEqual(["a/one", "b/two"]);
  });

  it("returns the accessible partial window when results shrink during pagination", async () => {
    const result = await searchCodeRepositories("path:cordis.patch.yml", {
      maxItems: 100,
      perPage: 100,
      request: async (_query, _page, perPage) =>
        response(
          100,
          Array.from({ length: perPage === 1 ? 1 : 99 }, (_, i) => ({
            id: i + 1,
            node_id: `R_${i + 1}`,
            full_name: `owner/repo-${i + 1}`,
          }))
        ),
    });

    expect(result.matches).toBe(99);
    expect(result.repositories).toHaveLength(99);
    expect(result.complete).toBe(false);
  });

  it("marks a query over the accessible window as partial", async () => {
    const matches = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      node_id: `R_${index + 1}`,
      full_name: `owner/repo-${index + 1}`,
    }));
    const request = vi.fn(async (_query: string, _page: number, perPage: number) =>
      response(4, perPage === 1 ? matches.slice(0, 1) : matches)
    );
    const result = await searchCodeRepositories("filename:SKILL.md", {
      maxItems: 3,
      perPage: 3,
      request,
      semanticRetries: 0,
      retryDelayMs: 0,
    });
    expect(result.matches).toBe(3);
    expect(result.totalMatches).toBe(4);
    expect(result.complete).toBe(false);
  });
});
