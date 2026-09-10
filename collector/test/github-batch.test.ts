import { describe, expect, it, vi } from "vitest";
import { fetchRepositoryUpdates } from "../src/github-batch.js";
import { rejectPrivateRepository, redactPrivateRejections } from "../src/github.js";
import { canRestorePrevious } from "../src/discovery-policy.js";

describe("fetchRepositoryUpdates", () => {
  it("returns a known private transition instead of treating it as an unresolved historical record", async () => {
    const requested = "fixture/previously-public";
    const canonical = "fixture/now-private";
    const request = vi.fn(async (query: string) => {
      expect(query).toContain("isPrivate");
      return { data: { repository0: { nameWithOwner: canonical, stargazerCount: 1, forkCount: 0,
        issues: { totalCount: 0 }, pushedAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z",
        isArchived: false, isFork: false, isPrivate: true } } };
    });
    const updates = await fetchRepositoryUpdates([requested], { request });
    const update = updates.get(requested)!;
    expect(update).toMatchObject({ fullName: canonical, private: true });
    const rejected = new Set<string>();
    const knownPrivateIds = new Set<string>();
    const earlierFailures = [
      { fullName: requested.toUpperCase(), reason: "fixture confidential description in read failure" },
      { fullName: canonical, reason: "fixture confidential description in another read failure" },
      { fullName: "fixture/public-repo", reason: "public read failure" },
    ];
    const record = rejectPrivateRepository(update, requested, rejected, knownPrivateIds);
    expect(record).not.toBeNull();
    expect(canRestorePrevious(requested, rejected)).toBe(false);
    expect(canRestorePrevious(canonical, rejected)).toBe(false);
    expect(JSON.stringify({ rejected: [record] })).not.toContain(canonical);
    expect(JSON.stringify({ rejected: [record] })).not.toContain(requested);
    const serialized = JSON.stringify({
      discoveryReview: { rejected: redactPrivateRejections([...earlierFailures, record!], knownPrivateIds) },
      report: { rejected: redactPrivateRejections([...earlierFailures, record!], knownPrivateIds).slice(0, 30) },
    });
    expect(serialized.toLowerCase()).not.toContain(requested);
    expect(serialized).not.toContain(canonical);
    expect(serialized).not.toContain("fixture confidential description");
    expect(serialized).toContain("public read failure");
  });

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
