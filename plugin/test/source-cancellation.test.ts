import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInstallVerificationCache, verifyInstallSpec } from "../src/install/install-verify.js";
import { verifySkillSource } from "../src/install/skill-install.js";

afterEach(() => {
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("source verification cancellation", () => {
  it("does not fetch for an already cancelled request, even when a target is cached", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({
      name: "demo", version: "1.0.0", dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    })));
    vi.stubGlobal("fetch", fetchMock);
    await verifyInstallSpec({ kind: "npm", spec: "demo" });
    const controller = new AbortController();
    controller.abort();
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" }, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    await expect(verifySkillSource("acme/skills", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache npm verification cancelled while the response body is read", async () => {
    const controller = new AbortController();
    const manifest = {
      name: "demo", version: "1.0.0", dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => { controller.abort(); return manifest; },
      })
      .mockImplementation(() => Promise.resolve(Response.json(manifest)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" }, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" })).resolves.toMatchObject({ target: "demo@1.0.0" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["bundle", "skill"])("stops %s verification before the next GitHub request", async (kind) => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { controller.abort(); return { default_branch: "main" }; },
    });
    vi.stubGlobal("fetch", fetchMock);
    const verification = kind === "bundle"
      ? verifyInstallSpec({ kind: "github", spec: "github:acme/demo" }, { signal: controller.signal })
      : verifySkillSource("acme/skills", controller.signal);
    await expect(verification).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["bundle", "skill"])("keeps the request timeout when %s verification has a caller signal", async (kind) => {
    const caller = new AbortController();
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      timeout.abort(new DOMException("Timed out", "TimeoutError"));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const verification = kind === "bundle"
      ? verifyInstallSpec({ kind: "npm", spec: "demo" }, { signal: caller.signal })
      : verifySkillSource("acme/skills", caller.signal);
    await expect(verification).rejects.toMatchObject({ name: "TimeoutError" });
    expect(caller.signal.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
