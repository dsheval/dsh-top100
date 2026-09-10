import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, cacheGet } from "../src/cache.js";
import { fetchRawFile } from "../src/github.js";
import { getCachedSelectedReadme, loadSelectedReadme, loadSelectedSkill } from "../src/selected-readme.js";

vi.mock("../src/cache.js", () => ({ cached: vi.fn(), cacheGet: vi.fn() }));
vi.mock("../src/github.js", () => ({ fetchRawFile: vi.fn() }));
const cache = vi.mocked(cached), get = vi.mocked(cacheGet), read = vi.mocked(fetchRawFile);
beforeEach(() => {
  vi.resetAllMocks();
  cache.mockImplementation(async (_kind, _key, fetch) => fetch());
  get.mockReturnValue(null);
});

describe("selected README evidence boundary", () => {
  it("keeps root-package README path, branch and cache behavior", async () => {
    read.mockResolvedValue("Root package documentation");
    expect(await loadSelectedReadme("acme/repo", null, "push-1", "main")).toBe("Root package documentation");
    expect(read).toHaveBeenCalledExactlyOnceWith("acme/repo", "README.md", "main");
    expect(cache).toHaveBeenCalledWith("readmes", expect.stringMatching(/^v2:[a-f0-9]{64}$/), expect.any(Function), 86_400_000);
    get.mockReturnValue("Cached root documentation");
    expect(getCachedSelectedReadme("acme/repo", null, "push-1", "main")).toBe("Cached root documentation");
    expect(get).toHaveBeenCalledExactlyOnceWith("readmes", expect.stringMatching(/^v2:[a-f0-9]{64}$/), 86_400_000);
  });
  it("reads a selected package's own README", async () => {
    read.mockResolvedValue("Selected package documentation");
    expect(await loadSelectedReadme("acme/repo", "packages/plugin", "push-1", "release")).toBe("Selected package documentation");
    expect(read).toHaveBeenCalledExactlyOnceWith("acme/repo", "packages/plugin/README.md", "release");
    expect(cache).toHaveBeenCalledWith("readmes", expect.stringMatching(/^v2:[a-f0-9]{64}$/), expect.any(Function), 86_400_000);
  });
  it("does not substitute root documentation when the subpackage README returns 404", async () => {
    read.mockImplementation(async (_repo, path) => path === "README.md" ? "Whole-product README with install commands" : null);
    expect(await loadSelectedReadme("acme/repo", "packages/plugin", "push-1", "main")).toBeNull();
    expect(read).toHaveBeenCalledExactlyOnceWith("acme/repo", "packages/plugin/README.md", "main");
  });
  it("does not mask a thrown read/cache failure with root documentation", async () => {
    read.mockRejectedValue(new Error("read failed"));
    await expect(loadSelectedReadme("acme/repo", "plugin", "push-1", "main")).rejects.toThrow("read failed");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("keeps a cache hit inside the selected subpackage without fetching again", async () => {
    cache.mockResolvedValue("Cached selected-package README");
    expect(await loadSelectedReadme("acme/repo", "plugin", "push-1", "main")).toBe("Cached selected-package README");
    expect(read).not.toHaveBeenCalled();
  });
  it("never falls back to cached root content when selected-package cache is absent", () => {
    get.mockImplementation((_kind, key) => key === "acme/repo" ? "Wrong root context" : null);
    expect(getCachedSelectedReadme("acme/repo", "plugin", "push-1", "main")).toBeNull();
    expect(get).toHaveBeenCalledExactlyOnceWith("readmes", expect.stringMatching(/^v2:[a-f0-9]{64}$/), 86_400_000);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["README", "SKILL"])("fetches new %s evidence after a revision or branch change and ignores legacy keys", async kind => {
    const values = new Map<string, string | null>([["acme/repo:plugin", "Legacy document"]]);
    cache.mockImplementation(async (_kind, key, fetch) => {
      if (values.has(key)) return values.get(key)!;
      const value = await fetch();
      if (value !== null) values.set(key, value);
      return value;
    });
    get.mockImplementation((_kind, key) => values.get(key) ?? null);
    const load = (revision: string, branch = "main") => kind === "README"
      ? loadSelectedReadme("acme/repo", "plugin", revision, branch)
      : loadSelectedSkill("acme/repo", "skills/example/SKILL.md", revision, branch);
    read.mockResolvedValueOnce("First version").mockResolvedValueOnce("Changed evidence").mockResolvedValueOnce("Release evidence");
    expect(await load("push-1")).toBe("First version");
    expect(await load("push-1")).toBe("First version");
    expect(await load("push-2")).toBe("Changed evidence");
    expect(await load("push-2", "release")).toBe("Release evidence");
    expect(read).toHaveBeenCalledTimes(3);
    if (kind === "README") {
      expect(getCachedSelectedReadme("acme/repo", "plugin", "push-2", "main")).toBe("Changed evidence");
      expect(getCachedSelectedReadme("acme/repo", "plugin", "push-3", "main")).toBeNull();
    }
  });

  it("propagates a skill read failure so the collector cannot cache a successful empty summary", async () => {
    read.mockRejectedValue(new Error("temporary raw failure"));
    await expect(loadSelectedSkill("acme/repo", "SKILL.md", "push-2", "main")).rejects.toThrow("temporary raw failure");
  });
});
