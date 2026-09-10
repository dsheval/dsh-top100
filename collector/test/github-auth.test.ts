import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRawFile, githubFetch, rejectPrivateRepository } from "../src/github.js";
import { canRestorePrevious } from "../src/discovery-policy.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_TOKEN;
});

describe("GitHub raw document failure semantics", () => {
  it("only treats an actual 404 as missing documentation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    await expect(fetchRawFile("acme/repo", "README.md", "main")).resolves.toBeNull();
  });

  it.each([403, 429, 500, 503])("throws on HTTP %s instead of caching absence", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("temporary failure", { status })));
    await expect(fetchRawFile("acme/repo", "README.md", "main")).rejects.toMatchObject({ status });
  });

  it.each(["TypeError", "TimeoutError"])("propagates %s read failures", async name => {
    const error = Object.assign(new Error("read unavailable"), { name });
    vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
    await expect(fetchRawFile("acme/repo", "SKILL.md", "main")).rejects.toBe(error);
  });

  it("bounds the raw request and body read with a timeout signal", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("Current document");
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(fetchRawFile("acme/repo", "README.md", "main")).resolves.toBe("Current document");
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally { timeout.mockRestore(); }
  });
});

describe("public catalog visibility boundary", () => {
  it.each([{ private: true }, { visibility: "private" }, { private: false, visibility: "private" }])(
    "rejects explicitly private metadata and exposes only an anonymous report: %j", visibility => {
      const requested = "fixture/old-private-name";
      const canonical = "fixture/new-private-name";
      const metadata = { ...visibility, full_name: canonical, description: "fixture confidential description" };
      const rejected = new Set<string>();
      const result = rejectPrivateRepository(metadata, requested, rejected, new Set());
      expect(result).toEqual({ fullName: "[private repository]", reason: "private repository" });
      expect(canRestorePrevious(requested.toUpperCase(), rejected)).toBe(false);
      expect(canRestorePrevious(canonical, rejected)).toBe(false);
      const serialized = JSON.stringify({ rejected: [result] });
      expect(serialized).not.toContain(requested);
      expect(serialized).not.toContain(canonical);
      expect(serialized).not.toContain(metadata.description);
    },
  );

  it.each([{}, { private: false }, { visibility: "public" }])("keeps old fixtures without a positive private flag compatible: %j", metadata => {
    const rejected = new Set<string>();
    expect(rejectPrivateRepository(metadata, "fixture/public-name", rejected, new Set())).toBeNull();
    expect(rejected.size).toBe(0);
  });
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
