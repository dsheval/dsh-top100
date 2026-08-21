import { afterEach, describe, expect, it, vi } from "vitest";
import { githubFetch } from "../src/github.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_TOKEN;
});

describe("GitHub authentication", () => {
  it("reads GITHUB_TOKEN when the request runs instead of at module load", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("token late-token");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.GITHUB_TOKEN = "late-token";

    await expect(githubFetch<{ ok: boolean }>("/test")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
