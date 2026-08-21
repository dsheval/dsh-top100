/**
 * detectSubdirBundle 单元测试：子目录 bundle 探测（根目录无标记、插件在子目录）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectSubdirBundle, isCordisPackageJson } from "../src/detect.js";
import { fetchRepoRoot, fetchFileViaApi } from "../src/github.js";

vi.mock("../src/github.js", () => ({
  fetchRepoRoot: vi.fn(),
  fetchFileViaApi: vi.fn(),
}));

const mockFetch = fetchRepoRoot as unknown as ReturnType<typeof vi.fn>;
const mockFetchFile = fetchFileViaApi as unknown as ReturnType<typeof vi.fn>;

function rootItem(name: string, type: "file" | "dir" = "file") {
  return { name, path: name, type, size: type === "file" ? 1 : 0 };
}

const CORDIS_SUBDIR = [
  rootItem("package.json"),
  rootItem("cordis.patch.yml"),
  rootItem("lib", "dir"),
];

describe("detectSubdirBundle", () => {
  beforeEach(() => vi.clearAllMocks());

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

  it("最多探测 3 个候选目录", async () => {
    const root = [
      rootItem("README.md"),
      rootItem("dsh-a", "dir"),
      rootItem("dsh-b", "dir"),
      rootItem("dsh-c", "dir"),
      rootItem("dsh-d", "dir"),
    ];
    mockFetch.mockResolvedValue([rootItem("package.json")]);
    const r = await detectSubdirBundle("someone/some-repo", root as never, "main");
    expect(r).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(3);
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
  beforeEach(() => vi.clearAllMocks());

  it("子目录无批处理文件但 package.json 依赖 @deepseek-ai → 命中", async () => {
    const root = [rootItem("README.md"), rootItem("dsh", "dir")];
    mockFetch.mockResolvedValue([rootItem("package.json")]);
    mockFetchFile.mockResolvedValue({
      content: JSON.stringify({
        name: "dsh-chart",
        peerDependencies: { "@deepseek-ai/dsh-tools": "*" },
      }),
      sha: "x",
    });
    const r = await detectSubdirBundle("iqingyoung/search2chart-mcp", root as never, "main");
    expect(r?.subdir).toBe("dsh");
    expect(r?.evidence[0]).toContain("DSH 依赖");
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
