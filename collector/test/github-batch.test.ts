import { describe, expect, it, vi } from "vitest";
import { fetchRepositoryUpdates } from "../src/github-batch.js";

describe("fetchRepositoryUpdates", () => {
  it("refreshes repositories in bounded GraphQL batches and keeps partial responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          repository0: {
            nameWithOwner: "owner/one",
            stargazerCount: 10,
            forkCount: 2,
            issues: { totalCount: 1 },
            pushedAt: null,
            updatedAt: "2026-08-20T00:00:00Z",
            isArchived: false,
            isFork: false,
          },
          repository1: null,
        },
        errors: [{ message: "repository unavailable", path: ["repository1"] }],
      })
      .mockResolvedValueOnce({
        data: {
          repository0: {
            nameWithOwner: "owner/three",
            stargazerCount: 30,
            forkCount: 3,
            issues: { totalCount: 0 },
            pushedAt: "2026-08-21T00:00:00Z",
            updatedAt: "2026-08-21T01:00:00Z",
            isArchived: true,
            isFork: false,
          },
        },
      });
    const progress = vi.fn();

    const updates = await fetchRepositoryUpdates(
      ["owner/one", "owner/two", "owner/three"],
      { batchSize: 2, request, onProgress: progress }
    );

    expect(request).toHaveBeenCalledTimes(2);
    expect(updates.get("owner/one")).toMatchObject({ stars: 10, pushedAt: "2026-08-20T00:00:00Z" });
    expect(updates.has("owner/two")).toBe(false);
    expect(updates.get("owner/three")?.archived).toBe(true);
    expect(progress.mock.calls).toEqual([[2, 3], [3, 3]]);
  });
});
