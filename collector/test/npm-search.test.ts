import { describe, expect, it, vi } from "vitest";
import {
  githubRepositoryFromNpmLink,
  searchNpmRepositories,
} from "../src/sources/npm-search.js";

describe("githubRepositoryFromNpmLink", () => {
  it.each([
    ["https://github.com/owner/repo", "owner/repo"],
    ["git+https://github.com/owner/repo.git", "owner/repo"],
    ["git://github.com/owner/repo.git", "owner/repo"],
    ["ssh://git@github.com/owner/repo.git", "owner/repo"],
    ["git@github.com:owner/repo.git", "owner/repo"],
    ["github:owner/repo", "owner/repo"],
  ])("normalizes %s", (input, expected) => {
    expect(githubRepositoryFromNpmLink(input)).toBe(expected);
  });

  it("ignores non-GitHub repository links", () => {
    expect(githubRepositoryFromNpmLink("https://gitlab.com/owner/repo")).toBeNull();
  });
});

describe("searchNpmRepositories", () => {
  it("paginates npm results and deduplicates linked GitHub repositories", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const from = Number(new URL(String(input)).searchParams.get("from"));
      const objects =
        from === 0
          ? [
              { package: { name: "a", links: { repository: "github:one/repo" } } },
              { package: { name: "b", links: { repository: "https://github.com/two/repo" } } },
            ]
          : [
              { package: { name: "c", links: { repository: "git+https://github.com/ONE/repo.git" } } },
            ];
      return new Response(JSON.stringify({ total: 3, objects }), { status: 200 });
    });

    const result = await searchNpmRepositories("dsh-plugin", {
      pageSize: 2,
      maxPages: 2,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.complete).toBe(true);
    expect(result.packages).toBe(3);
    expect(result.repositories).toEqual(["one/repo", "two/repo"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
