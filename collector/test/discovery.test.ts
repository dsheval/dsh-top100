import { describe, expect, it } from "vitest";
import type { GithubRepo } from "../src/github.js";
import { discoverRepositories } from "../src/sources/discovery.js";

function repo(id: number, fullName: string): GithubRepo {
  const [owner, name] = fullName.split("/");
  return {
    id,
    node_id: `R_${id}`,
    full_name: fullName,
    name,
    owner: { login: owner },
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

describe("discoverRepositories", () => {
  it("merges repository, code, and npm evidence for the same candidate", async () => {
    const result = await discoverRepositories({
      config: {
        repositoryQueries: [{ id: "topic", query: "topic:dsh-plugin" }],
        codeQueries: [{ id: "marker", query: "path:cordis.patch.yml" }],
        npmQueries: [{ id: "npm", query: "dsh-plugin" }],
      },
      repositorySearch: async (query) => ({
        repositories: [repo(1, "one/plugin")],
        audit: { query, requests: 2, shards: 1, repositories: 1 },
      }),
      codeSearch: async () => ({
        repositories: [
          { id: 1, node_id: "R_1", full_name: "one/plugin" },
          { id: 2, node_id: "R_2", full_name: "two/plugin" },
        ],
        requests: 2,
        matches: 2,
        totalMatches: 2,
        complete: true,
      }),
      npmSearch: async () => ({
        repositories: ["ONE/plugin", "three/plugin"],
        packages: 2,
        requests: 1,
        complete: true,
      }),
    });

    expect(result.candidates).toHaveLength(3);
    const first = result.candidates.find(
      (candidate) => candidate.fullName.toLowerCase() === "one/plugin"
    );
    expect(first?.sources).toEqual([
      "github-repository:topic",
      "github-code:marker",
      "npm:npm",
    ]);
    expect(result.audit.complete).toBe(true);
    expect(result.audit.sources).toHaveLength(3);
  });

  it("adds a pushed qualifier in incremental mode", async () => {
    let receivedQuery = "";
    await discoverRepositories({
      mode: "incremental",
      since: new Date("2026-08-20T00:00:00Z"),
      config: { repositoryQueries: [{ id: "x", query: "topic:dsh-plugin" }], codeQueries: [], npmQueries: [] },
      repositorySearch: async (query) => {
        receivedQuery = query;
        return {
          repositories: [],
          audit: { query, requests: 1, shards: 1, repositories: 0 },
        };
      },
    });
    expect(receivedQuery).toContain("pushed:>=2026-08-20T00:00:00Z");
  });
});
