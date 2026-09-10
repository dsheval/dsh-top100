/**
 * detectSubdirBundle 单元测试：子目录 bundle 探测（根目录无标记、插件在子目录）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectPlugin, detectSubdirBundle, isCordisPackageJson } from "../src/detect.js";
import { fetchRepoRoot, fetchFileViaApi } from "../src/github.js";

vi.mock("../src/github.js", () => ({
  fetchRepoRoot: vi.fn(),
  fetchFileViaApi: vi.fn(),
}));

const mockFetch = fetchRepoRoot as unknown as ReturnType<typeof vi.fn>;
const mockFetchFile = fetchFileViaApi as unknown as ReturnType<typeof vi.fn>;

function rootItem(name: string, type: "file" | "dir" = "file", path = name) {
  return { name, path, type, size: type === "file" ? 1 : 0 };
}

const CORDIS_SUBDIR = [
  rootItem("package.json"),
  rootItem("cordis.patch.yml"),
  rootItem("lib", "dir"),
];

describe("pnpm workspace discovery", () => {
  beforeEach(() => { vi.resetAllMocks(); mockFetch.mockResolvedValue([]); });

  it("finds the real Bundle under a two-level pnpm workspace", async () => {
    mockFetchFile.mockImplementation(async (_repo, file) => ({ content: file === "pnpm-workspace.yaml"
      ? "packages:\n  - extensions/*\n  - packages/*/*\n"
      : JSON.stringify({ name: "@fixture/browser-bridge", dsh: { bundle: { patch: "./cordis.patch.yml" } } }), sha: "x" }));
    mockFetch.mockImplementation(async (_repo, _ref, directory) => {
      if (directory === "packages") return [rootItem("browser", "dir", "packages/browser")];
      if (directory === "packages/browser") return [rootItem("bridge", "dir", "packages/browser/bridge")];
      if (directory === "packages/browser/bridge") return CORDIS_SUBDIR;
      return [];
    });
    const result = await detectPlugin("fixture/browser", [rootItem("pnpm-workspace.yaml"), rootItem("packages", "dir")] as never, "pinned-commit");
    expect(result).toMatchObject({ isPlugin: true, kind: "bundle", pluginPath: "packages/browser/bridge", packageName: "@fixture/browser-bridge" });
    expect(mockFetchFile).toHaveBeenCalledWith("fixture/browser", "pnpm-workspace.yaml", "pinned-commit");
  });

  it("keeps unreadable workspace evidence inconclusive", async () => {
    mockFetchFile.mockResolvedValue(null);
    await expect(detectPlugin("fixture/browser", [rootItem("pnpm-workspace.yaml")] as never)).rejects.toThrow("could not be read");
  });

  it("rejects malformed YAML without asserting that the repository is not a plugin", async () => {
    mockFetchFile.mockResolvedValue({content: "packages: [broken", sha: "x"});
    await expect(detectPlugin("fixture/browser", [rootItem("pnpm-workspace.yaml")] as never)).rejects.toThrow("could not be parsed");
  });

  it("does not follow traversal or unbounded workspace patterns", async () => {
    mockFetchFile.mockResolvedValue({content: "packages: ['../outside', '/absolute', 'packages/**', 'a/*/*/*']", sha: "x"});
    expect((await detectPlugin("fixture/browser", [rootItem("pnpm-workspace.yaml")] as never)).isPlugin).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("detectSubdirBundle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue([]);
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "test-plugin", main: "lib/index.js" }), sha: "x" });
  });

  it("命中间名子目录（dsh-pet 场景：根目录无标记，插件在 dsh-pet/）", async () => {
    const root = [
      rootItem("README.md"),
      rootItem("DESIGN.md"),
      rootItem("dsh-pet", "dir"),
      rootItem("assets", "dir"),
      rootItem("scripts", "dir"),
    ];
    mockFetch.mockResolvedValue(CORDIS_SUBDIR);
    const r = await detectSubdirBundle("PC2005-cloud/dsh-pet", root as never, "master");
    expect(r?.subdir).toBe("dsh-pet");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("PC2005-cloud/dsh-pet", "master", "dsh-pet");
  });

  it("dsh- 前缀子目录命中", async () => {
    const root = [
      rootItem("README.md"),
      rootItem("dsh-plugin", "dir"),
      rootItem("docs", "dir"),
    ];
    mockFetch.mockResolvedValue(CORDIS_SUBDIR);
    const r = await detectSubdirBundle("someone/some-repo", root as never, "main");
    expect(r?.subdir).toBe("dsh-plugin");
  });

  it("无可疑目录（仅 docs/assets/src 等）返回 null 且不调 API", async () => {
    const root = [
      rootItem("README.md"),
      rootItem("docs", "dir"),
      rootItem("assets", "dir"),
      rootItem("src", "dir"),
      rootItem("public", "dir"),
    ];
    const r = await detectSubdirBundle("someone/some-repo", root as never, "main");
    expect(r).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("可疑目录存在但无 cordis 标记（无 package.json）返回 null", async () => {
    const root = [rootItem("README.md"), rootItem("dsh-tool", "dir")];
    mockFetch.mockResolvedValue([rootItem("README.md"), rootItem("lib", "dir")]);
    const r = await detectSubdirBundle("someone/some-repo", root as never, "main");
    expect(r).toBeNull();
  });

  it("可疑目录有 package.json 但无 cordis 标记返回 null", async () => {
    const root = [rootItem("README.md"), rootItem("plugin", "dir")];
    mockFetch.mockResolvedValue([rootItem("package.json"), rootItem("README.md")]);
    const r = await detectSubdirBundle("someone/some-repo", root as never, "main");
    expect(r).toBeNull();
  });

  it("最多探测 12 个候选目录", async () => {
    const root = [
      rootItem("README.md"),
      rootItem("dsh-a", "dir"),
      rootItem("dsh-b", "dir"),
      rootItem("dsh-c", "dir"),
      rootItem("dsh-d", "dir"),
      rootItem("dsh-e", "dir"),
      rootItem("dsh-f", "dir"),
      rootItem("dsh-g", "dir"),
      rootItem("dsh-h", "dir"),
      rootItem("dsh-i", "dir"),
      rootItem("dsh-j", "dir"),
      rootItem("dsh-k", "dir"),
      rootItem("dsh-l", "dir"),
      rootItem("dsh-m", "dir"),
    ];
    mockFetch.mockResolvedValue([rootItem("package.json")]);
    await expect(detectSubdirBundle("someone/some-repo", root as never, "main")).rejects.toThrow("candidate budget exhausted");
    expect(mockFetch).toHaveBeenCalledTimes(12);
  });
});

describe("incomplete discovery budgets", () => {
  beforeEach(() => { vi.resetAllMocks(); mockFetch.mockResolvedValue([]); });

  function packages(count: number, valid: string | null) {
    const directories = Array.from({ length: count }, (_, i) => `pkg${String(i + 1).padStart(2, "0")}`);
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === "plugins"
      ? directories.map(name => rootItem(name, "dir", `plugins/${name}`)) : CORDIS_SUBDIR);
    mockFetchFile.mockImplementation(async (_repo, path) => ({ sha: "test", content: JSON.stringify(
      valid && path === `plugins/${valid}/package.json`
        ? { name: "valid-plugin", dsh: { bundle: { patch: "./cordis.patch.yml" } } }
        : { name: "ordinary-library" }
    ) }));
    return [rootItem("plugins", "dir")];
  }

  it.each(["pkg13", null])("keeps 13-package scans inconclusive when unvisited package %s may be valid", async valid => {
    const root = packages(13, valid);
    await expect(detectPlugin("acme/repo", root as never)).rejects.toThrow("candidate budget exhausted");
    expect(mockFetch).not.toHaveBeenCalledWith("acme/repo", undefined, "plugins/pkg13");
  });

  it("still rejects a fully inspected 12-package repository with no valid markers", async () => {
    expect((await detectPlugin("acme/repo", packages(12, null) as never)).isPlugin).toBe(false);
  });

  it("keeps a valid selected package when later candidates exceed the budget", async () => {
    expect(await detectPlugin("acme/repo", packages(13, "pkg01") as never)).toMatchObject({
      isPlugin: true, pluginPath: "plugins/pkg01", kind: "bundle",
    });
  });

  it("retains verified root skill evidence even when the package scan is incomplete", async () => {
    const root = [...packages(13, null), rootItem("SKILL.md")];
    expect(await detectPlugin("acme/repo", root as never)).toMatchObject({ isPlugin: true, type: "skill", skillFiles: ["SKILL.md"] });
  });

  it.each([25, 24])("does not turn a %i-directory skill budget into a false definitive rejection", async count => {
    const dirs = Array.from({ length: count }, (_, i) => `skill${i + 1}`);
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === "skills"
      ? dirs.map(name => rootItem(name, "dir", `skills/${name}`))
      : path === "skills/skill25" ? [rootItem("SKILL.md", "file", `${path}/SKILL.md`)] : []);
    const result = detectPlugin("acme/repo", [rootItem("skills", "dir")] as never);
    if (count === 25) await expect(result).rejects.toThrow("candidate budget exhausted");
    else expect((await result).isPlugin).toBe(false);
  });

  it("keeps a discovered skill when more skill directories remain unvisited", async () => {
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === "skills"
      ? Array.from({ length: 25 }, (_, i) => rootItem(`skill${i}`, "dir", `skills/skill${i}`))
      : path === "skills/skill0" ? [rootItem("SKILL.md", "file", `${path}/SKILL.md`)] : []);
    expect(await detectPlugin("acme/repo", [rootItem("skills", "dir")] as never)).toMatchObject({ isPlugin: true, type: "skill" });
  });
});

describe("primary-only collection detection", () => {
  beforeEach(() => { vi.resetAllMocks(); mockFetch.mockResolvedValue([]); });
  const primary = { primaryOnly: true };

  it.each(["bundle", "client", "host"])("selects the same root %s without inspecting unrelated skills or workspaces", async kind => {
    const declaration = kind === "bundle" ? { dsh: { bundle: { patch: "./cordis.patch.yml" } } }
      : kind === "client" ? { dsh: { client: { platform: "web" } }, exports: { "./client": "./client.js" } }
        : { main: "./index.js", peerDependencies: { "@deepseek-ai/dsh-tools": "*" } };
    mockFetchFile.mockResolvedValue({ sha: "x", content: JSON.stringify({ name: "root-package", workspaces: ["packages/*"], ...declaration }) });
    const root = [rootItem("package.json"), rootItem("skills", "dir"), rootItem("packages", "dir"),
      ...(kind === "bundle" ? [rootItem("cordis.patch.yml")] : [])];
    const full = await detectPlugin("acme/repo", root as never, "main");
    vi.clearAllMocks();
    const selected = await detectPlugin("acme/repo", root as never, "main", primary);
    expect(selected).toMatchObject({ kind: full.kind, packageName: full.packageName, pluginPath: full.pluginPath,
      type: full.type, installMethod: full.installMethod, pluginPaths: ["."] });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockFetchFile).toHaveBeenCalledExactlyOnceWith("acme/repo", "package.json", "main");
  });

  it("keeps sorted subpackage priority while stopping before lower-priority package and skill reads", async () => {
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === "skills" ? [] : CORDIS_SUBDIR);
    mockFetchFile.mockImplementation(async (_repo, path) => ({ sha: "x", content: JSON.stringify({
      name: path.split("/")[0], dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }) }));
    const root = [rootItem("dsh-lower", "dir"), rootItem("skills", "dir"), rootItem("repo", "dir"), rootItem("plugin", "dir")];
    const full = await detectPlugin("acme/repo", root as never, "main");
    expect(full.pluginPaths).toEqual(["plugin", "repo", "dsh-lower"]);
    vi.clearAllMocks();
    const selected = await detectPlugin("acme/repo", root as never, "main", primary);
    expect(selected).toMatchObject({ kind: full.kind, packageName: full.packageName, pluginPath: full.pluginPath, pluginPaths: ["plugin"] });
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith("acme/repo", "main", "plugin");
    expect(mockFetchFile).toHaveBeenCalledExactlyOnceWith("acme/repo", "plugin/package.json", "main");
  });

  it("falls back to the same first skill but does not enumerate later skill directories", async () => {
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === "skills"
      ? ["empty", "first", "later"].map(name => rootItem(name, "dir", `skills/${name}`))
      : path === "skills/empty" ? [] : [rootItem("SKILL.md", "file", `${path}/SKILL.md`)]);
    const root = [rootItem("skills", "dir")];
    const full = await detectPlugin("acme/repo", root as never, "main");
    expect(full.skillFiles).toEqual(["skills/first/SKILL.md", "skills/later/SKILL.md"]);
    vi.clearAllMocks();
    const selected = await detectPlugin("acme/repo", root as never, "main", primary);
    expect(selected).toMatchObject({ type: "skill", skillFiles: [full.skillFiles[0]] });
    expect(mockFetch.mock.calls.map(call => call[2])).toEqual(["skills", "skills/empty", "skills/first"]);
    expect(selected.evidence).toContain("skills directory (1 SKILL.md)");
  });

  it("keeps direct skill document priority and skips nested skills", async () => {
    mockFetch.mockResolvedValue([rootItem("SKILL.md", "file", "skills/SKILL.md"), rootItem("nested", "dir", "skills/nested")]);
    expect(await detectPlugin("acme/repo", [rootItem("skills", "dir")] as never, "main", primary)).toMatchObject({
      type: "skill", skillFiles: ["skills/SKILL.md"],
    });
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith("acme/repo", "main", "skills");
  });

  it.each(["packages", "skills"])("does not turn a truncated unsuccessful %s scan into a definitive rejection", async directory => {
    const count = directory === "packages" ? 13 : 25;
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === directory
      ? Array.from({ length: count }, (_, i) => rootItem(`item${i}`, "dir", `${directory}/item${i}`)) : []);
    await expect(detectPlugin("acme/repo", [rootItem(directory, "dir")] as never, "main", primary)).rejects.toThrow("candidate budget exhausted");
  });
});

describe("detectPlugin monorepo validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue([]);
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "test-plugin", main: "lib/index.js" }), sha: "x" });
  });

  it("falls back from a non-plugin workspace root to a valid plugin/ package", async () => {
    const root = [
      rootItem("package.json"),
      rootItem("plugin", "dir"),
      rootItem("schema", "dir"),
    ];
    mockFetch.mockImplementation(async (_fullName: string, _branch: string, path: string) => {
      if (path === "plugin") return CORDIS_SUBDIR;
      return [];
    });
    mockFetchFile.mockImplementation(async (_fullName: string, path: string) => ({
      sha: path,
      content: path === "package.json"
        ? JSON.stringify({ private: true, workspaces: ["schema", "plugin"] })
        : JSON.stringify({
          name: "@dsheval/dsh-top100-plugin",
          repository: { type: "git", url: "git+https://github.com/dsheval/dsh-top100.git", directory: "plugin" },
          dsh: { bundle: { patch: "./cordis.patch.yml" } },
        }),
    }));

    const result = await detectPlugin("dsheval/dsh-top100", root as never, "main");

    expect(result).toMatchObject({
      isPlugin: true,
      type: "cordis-plugin",
      pluginPath: "plugin",
      packageName: "@dsheval/dsh-top100-plugin",
      pluginPaths: ["plugin"],
    });
    expect(mockFetchFile).toHaveBeenCalledWith("dsheval/dsh-top100", "package.json", "main");
    expect(mockFetchFile).toHaveBeenCalledWith("dsheval/dsh-top100", "plugin/package.json", "main");
  });

  it("does not accept an ordinary Node workspace", async () => {
    const root = [rootItem("package.json"), rootItem("packages", "dir")];
    mockFetchFile.mockImplementation(async (_fullName: string, path: string) => ({
      sha: path,
      content: path === "package.json"
        ? JSON.stringify({ private: true, workspaces: ["packages/*"] })
        : JSON.stringify({ name: "@acme/web", dependencies: { react: "latest" } }),
    }));
    mockFetch.mockImplementation(async (_fullName: string, _branch: string, path: string) => {
      if (path === "packages") return [rootItem("web", "dir", "packages/web")];
      if (path === "packages/web") return [rootItem("package.json", "file", "packages/web/package.json")];
      return [];
    });

    const result = await detectPlugin("acme/web-monorepo", root as never, "main");

    expect(result.isPlugin).toBe(false);
  });

  it("keeps a valid root plugin at the repository root", async () => {
    const root = [rootItem("package.json"), rootItem("cordis.patch.yml")];
    mockFetchFile.mockResolvedValue({
      sha: "root-package",
      content: JSON.stringify({
        name: "dsh-root-plugin",
        dsh: { bundle: { patch: "./cordis.patch.yml" } },
      }),
    });

    const result = await detectPlugin("acme/dsh-root-plugin", root as never, "main");

    expect(result).toMatchObject({
      isPlugin: true,
      type: "cordis-plugin",
      pluginPath: null,
      packageName: "dsh-root-plugin",
      pluginPaths: ["."],
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("selects one deterministic primary package and records every valid plugin package once", async () => {
    const root = [
      rootItem("package.json"),
      rootItem("plugin", "dir"),
      rootItem("plugins", "dir"),
    ];
    mockFetchFile.mockImplementation(async (_fullName: string, path: string) => ({
      sha: path,
      content: path === "package.json"
        ? JSON.stringify({ private: true, workspaces: ["plugin", "plugins/*", "plugin"] })
        : JSON.stringify({
          name: path.startsWith("plugin/package") ? "@acme/primary" : "@acme/secondary",
          dsh: { bundle: { patch: "./cordis.patch.yml" } },
        }),
    }));
    mockFetch.mockImplementation(async (_fullName: string, _branch: string, path: string) => {
      if (path === "plugins") return [rootItem("secondary", "dir", "plugins/secondary")];
      if (path === "plugin" || path === "plugins/secondary") return [
        rootItem("package.json", "file", `${path}/package.json`),
        rootItem("cordis.patch.yml", "file", `${path}/cordis.patch.yml`),
      ];
      return [];
    });

    const result = await detectPlugin("acme/plugin-suite", root as never, "main");

    expect(result.pluginPath).toBe("plugin");
    expect(result.packageName).toBe("@acme/primary");
    expect(result.pluginPaths).toEqual(["plugin", "plugins/secondary"]);
  });

  it("keeps a valid root as primary while recording validated workspace plugins", async () => {
    const root = [
      rootItem("package.json"),
      rootItem("cordis.patch.yml"),
      rootItem("packages", "dir"),
    ];
    mockFetchFile.mockImplementation(async (_fullName: string, path: string) => ({
      sha: path,
      content: path === "package.json"
        ? JSON.stringify({
            name: "@acme/root-plugin",
            workspaces: ["packages/*"],
            dsh: { bundle: { patch: "./cordis.patch.yml" } },
          })
        : JSON.stringify({
            name: "@acme/extra-plugin",
            dsh: { bundle: { patch: "./cordis.patch.yml" } },
          }),
    }));
    mockFetch.mockImplementation(async (_fullName: string, _branch: string, path: string) => {
      if (path === "packages") return [rootItem("extra", "dir", "packages/extra")];
      if (path === "packages/extra") return CORDIS_SUBDIR.map((item) => ({
        ...item,
        path: `packages/extra/${item.path}`,
      }));
      return [];
    });

    const result = await detectPlugin("acme/root-suite", root as never, "release");

    expect(result.pluginPath).toBeNull();
    expect(result.packageName).toBe("@acme/root-plugin");
    expect(result.pluginPaths).toEqual([".", "packages/extra"]);
  });
});

describe("isCordisPackageJson", () => {
  it("纯 client 注入插件（dsh.client 字段，dsh-read-history 案例）判定为插件", () => {
    const pkg = JSON.stringify({
      name: "dsh-read-history",
      main: "lib/index.js",
      exports: { ".": "./lib/index.js", "./client": "./lib/client.js" },
      dsh: { client: { platform: "web", inject: ["@deepseek-ai/dsh-client-runtime"] } },
    });
    expect(isCordisPackageJson(pkg)).toBe(true);
  });

  it("dshClient 顶层字段（With-With 案例形态）判定为插件", () => {
    const pkg = JSON.stringify({
      name: "dsh-hindsight-plugins",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      dshClient: { inject: ["@deepseek-ai/dsh-client-runtime"], platform: "web" },
    });
    expect(isCordisPackageJson(pkg)).toBe(true);
  });

  it("无任何 DSH/cordis 标记的普通包判定为非插件", () => {
    const pkg = JSON.stringify({
      name: "some-tool",
      dependencies: { lodash: "^4.0.0" },
    });
    expect(isCordisPackageJson(pkg)).toBe(false);
  });

  it("dsh 字段存在但无 client/bundle（如只有 dsh.xxx 自定义）判定为非插件", () => {
    const pkg = JSON.stringify({
      name: "some-repo",
      dsh: { something: { else: true } },
    });
    expect(isCordisPackageJson(pkg)).toBe(false);
  });

  it("null/空内容返回 false", () => {
    expect(isCordisPackageJson(null)).toBe(false);
    expect(isCordisPackageJson("")).toBe(false);
  });
});

describe("detectSubdirBundle 子目录依赖判据（#34 search2chart-mcp 场景）", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue([]);
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "test-plugin", main: "lib/index.js" }), sha: "x" });
  });

  it("子目录具有运行入口及 DSH peer 依赖 → 命中", async () => {
    const root = [rootItem("README.md"), rootItem("dsh", "dir")];
    mockFetch.mockResolvedValue([rootItem("package.json")]);
    mockFetchFile.mockResolvedValue({
      content: JSON.stringify({
        name: "dsh-chart",
        main: "lib/index.js",
        peerDependencies: { "@deepseek-ai/dsh-tools": "*" },
      }),
      sha: "x",
    });
    const r = await detectSubdirBundle("iqingyoung/search2chart-mcp", root as never, "main");
    expect(r?.subdir).toBe("dsh");
    expect(r?.evidence[0]).toContain("host declaration and entry");
  });

  it("子目录 package.json 无 DSH 依赖且无标记 → 不命中", async () => {
    const root = [rootItem("README.md"), rootItem("dsh", "dir")];
    mockFetch.mockResolvedValue([rootItem("package.json")]);
    mockFetchFile.mockResolvedValue({
      content: JSON.stringify({ name: "lib", dependencies: { lodash: "^4" } }),
      sha: "x",
    });
    const r = await detectSubdirBundle("someone/some-repo", root as never, "main");
    expect(r).toBeNull();
  });
});


describe("discovery structure policy", () => {
  beforeEach(() => { vi.resetAllMocks(); mockFetch.mockResolvedValue([]); });

  it.each([
    { name: "app", devDependencies: { "@deepseek-ai/cordis": "*" }, main: "index.js" },
    { name: "library", dependencies: { "not-cordis-compatible": "*" }, main: "index.js" },
    { name: "library", dependencies: { "@deepseek-ai/dsh-tools": "*" } },
    { name: "desktop", dependencies: { "@deepseek-ai/cordis": "*", electron: "*" }, main: "index.js" },
    { name: "cli", bin: "cli.js", peerDependencies: { cordis: "*" }, main: "index.js" },
    { name: "invalid", dsh: { bundle: { patch: true } } },
    { name: "invalid", dsh: { bundle: { patch: "../secret.yml" } } },
    { name: "invalid", dsh: { client: true }, main: "index.js" },
    { name: "invalid", dsh: { client: { platform: "web", inject: "runtime" } }, exports: { "./client": "./client.js" } },
    { name: "invalid", dsh: { client: { platform: "web", inject: [] } } },
    { name: "types-only", peerDependencies: { cordis: "*" }, exports: { ".": { types: "./index.d.ts" } } },
  ])("does not promote weak/malformed package evidence: %j", (pkg) => {
    expect(isCordisPackageJson(JSON.stringify(pkg))).toBe(false);
  });

  it("rejects marker-only packages without an entry or bundle declaration", async () => {
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "demo" }), sha: "x" });
    expect((await detectPlugin("acme/demo", [rootItem("package.json"), rootItem("cordis.patch.yml")] as never)).isPlugin).toBe(false);
  });

  it("rejects invalid JSON even when a marker exists", async () => {
    mockFetchFile.mockResolvedValue({ content: "{", sha: "x" });
    expect((await detectPlugin("acme/demo", [rootItem("package.json"), rootItem("cordis.patch.yml")] as never)).isPlugin).toBe(false);
  });

  it("treats failed reads of an observed package as inconclusive", async () => {
    mockFetchFile.mockResolvedValue(null);
    await expect(detectPlugin("acme/demo", [rootItem("package.json")] as never)).rejects.toThrow("metadata unavailable");
  });

  it("does not fall back to markers when an explicit bundle path is unsafe", async () => {
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "demo", main: "index.js", dsh: { bundle: { patch: "../secret.yml" } } }), sha: "x" });
    expect((await detectPlugin("acme/demo", [rootItem("package.json"), rootItem("cordis.patch.yml")] as never)).isPlugin).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires the declared bundle patch file to exist", async () => {
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "demo", dsh: { bundle: { patch: "./missing.yml" } } }), sha: "x" });
    expect((await detectPlugin("acme/demo", [rootItem("package.json")] as never)).isPlugin).toBe(false);
  });

  it("validates nested bundle patch paths", async () => {
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "demo", dsh: { bundle: { patch: "./config/patch.yml" } } }), sha: "x" });
    mockFetch.mockResolvedValue([rootItem("patch.yml", "file", "config/patch.yml")]);
    const result = await detectPlugin("acme/demo", [rootItem("package.json")] as never);
    expect(result.kind).toBe("bundle");
    expect(mockFetch).toHaveBeenCalledWith("acme/demo", undefined, "config");
  });

  it("accepts a client without optional inject dependencies", () => {
    expect(isCordisPackageJson(JSON.stringify({ name: "no-dependency-client", dsh: { client: { platform: "web" } }, exports: { "./client": "./client.js" } }))).toBe(true);
  });
  it("records client evidence separately from bundle installability", async () => {
    mockFetchFile.mockResolvedValue({ content: JSON.stringify({ name: "client", dsh: { client: { platform: "web", inject: [] } }, exports: { "./client": "./client.js" } }), sha: "x" });
    const result = await detectPlugin("acme/client", [rootItem("package.json")] as never);
    expect(result).toMatchObject({ isPlugin: true, kind: "client", type: "cordis-plugin" });
  });

  it("discovers standard skills/<name>/SKILL.md collections with bounded depth", async () => {
    mockFetch.mockImplementation(async (_repo, _branch, path) => path === "skills"
      ? [rootItem("first", "dir", "skills/first"), rootItem("nested", "dir", "skills/nested")]
      : path === "skills/first" ? [rootItem("SKILL.md", "file", "skills/first/SKILL.md")]
      : [rootItem("deeper", "dir", "skills/nested/deeper")]);
    const result = await detectPlugin("acme/skill-library", [rootItem("skills", "dir")] as never);
    expect(result).toMatchObject({ kind: "skill", skillFiles: ["skills/first/SKILL.md"] });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not accept a directory named SKILL.md as a skill file", async () => {
    expect((await detectPlugin("acme/demo", [rootItem("SKILL.md", "dir")] as never)).isPlugin).toBe(false);
  });
});
