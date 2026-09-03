import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebServerService } from "../src/host/contracts.js";
import { mountRoutes } from "../src/host/routes.js";
import { invalidateCatalog } from "../src/host/catalog.js";
import { clearInstallApprovals } from "../src/host/install-preflight.js";
import { clearInstallVerificationCache } from "../src/install/install-verify.js";
import type { InstallResult } from "../src/shared/types.js";
import type { PluginCommandRuntime } from "../src/install/dsh-cli.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
const temporaryProfiles: string[] = [];

beforeEach(() => {
  // Disk snapshots must not bypass mocked fetches on repeated test runs.
  const cacheDirectory = mkdtempSync(join(tmpdir(), "dsh-top100-route-cache-"));
  temporaryProfiles.push(cacheDirectory);
  vi.stubEnv("DSH_TOP100_CACHE_DIR", cacheDirectory);
});

afterEach(() => {
  invalidateCatalog();
  clearInstallApprovals();
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const directory of temporaryProfiles.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function routeHarness() {
  const routes = new Map<string, Handler>();
  const webServer: WebServerService = {
    register(route) {
      routes.set(route.path, route.handler);
      return () => { routes.delete(route.path); };
    },
  };
  const request = async (path: string, options: { method?: string; body?: unknown } = {}) => {
    const stream = Readable.from(options.body === undefined ? [] : [Buffer.from(JSON.stringify(options.body))]);
    Object.assign(stream, {
      method: options.method ?? "GET",
      url: path,
      headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" },
    });
    let status = 0;
    let output = "";
    const response = {
      writeHead(code: number) { status = code; return response; },
      end(chunk?: string | Buffer) { output += chunk?.toString() ?? ""; return response; },
    } as unknown as ServerResponse;
    const handler = routes.get(path.split("?")[0]);
    if (!handler) throw new Error(`missing route ${path}`);
    await handler(stream as IncomingMessage, response);
    return { status, body: JSON.parse(output) as Record<string, unknown> };
  };
  return { webServer, request };
}

function ok(): InstallResult {
  return { exitCode: 0, timedOut: false, stdout: "", stderr: "", cancelled: false };
}

function profileFixture(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), `dsh-top100-${name}-`));
  temporaryProfiles.push(directory);
  const packageDir = join(directory, "node_modules", "demo");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({
    name: "demo",
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  }));
  writeFileSync(join(packageDir, "cordis.patch.yml"), "- insert:\n    - id: custom-loader-id\n      name: demo\n");
  writeFileSync(join(directory, "package.json"), `${JSON.stringify({
    dependencies: { demo: "github:acme/demo" },
    dsh: { profile: { bundles: ["demo"] } },
  }, null, 2)}\n`);
  writeFileSync(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\ncommit: old\n");
  writeFileSync(join(directory, "pnpm-workspace.yaml"), "packages:\n  - .\n");
  writeFileSync(join(directory, "cordis.patch.yml"), "- id: custom-loader-id\n  disabled: true\n");
  return directory;
}

async function waitForBatch(
  request: ReturnType<typeof routeHarness>["request"],
  batchId: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(batchId)}`);
    const jobs = response.body.jobs as Array<Record<string, unknown>>;
    if (["installed", "failed", "cancelled"].includes(String(jobs[0]?.phase))) return jobs[0];
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not finish");
}

describe("plugin lifecycle routes", () => {
  it("keeps the Plugin directory available when the separate Skills source fails", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-route-catalog-scope-"));
    temporaryProfiles.push(directory);
    writeFileSync(join(directory, "package.json"), `${JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }, null, 2)}\n`);
    const catalogEntry = {
      rank: 1, fullName: "acme/plugin", name: "plugin", owner: "acme",
      description: "Plugin", descriptionZh: "插件", stars: 1, dailyStars: 0,
      weeklyStars: 0, hotScore: 1, forks: 0, openIssues: 0, language: null,
      homepage: null, license: null, topics: [], tags: [], categories: [], type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "acme-plugin", commands: ["dsh plugin --profile web add acme-plugin"] },
      sources: [], url: "https://github.com/acme/plugin", pushedAt: "", createdAt: "", updatedAt: "",
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/rankings-search.json")) {
        return new Response(JSON.stringify({
          schemaVersion: 2, generatedAt: "2026-09-02T00:00:00Z", snapshotDate: "2026-09-02",
          rankings: [catalogEntry],
        }), { status: 200 });
      }
      if (value.endsWith("/manifest.json")) return new Response("not found", { status: 404 });
      return new Response("unavailable", { status: 503 });
    }));
    const harness = routeHarness();
    mountRoutes(harness, {
      dataUrl: "https://catalog-scope.example.invalid/data",
      profile: "web",
      profileDirectory: directory,
    });

    const response = await harness.request("/dsh-top100/rankings?view=total&catalogScope=plugins");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      catalogScope: "plugins",
      total: 1,
      scopeCounts: { plugins: 1, skills: 0, ecosystem: 0 },
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({ fullName: "acme/plugin", installable: true }),
    ]);
  });

  it("loads the hot Plugin view without downloading search or Skills directories", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-route-hot-metadata-"));
    temporaryProfiles.push(directory);
    writeFileSync(join(directory, "package.json"), `${JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }, null, 2)}\n`);
    const snapshotId = "2026-09-02-hot-metadata";
    const generatedAt = "2026-09-02T00:00:00Z";
    const prefix = `/data/snapshots/${snapshotId}`;
    const catalogEntry = {
      rank: 1, fullName: "acme/hot", name: "hot", owner: "acme",
      description: "Hot Plugin", descriptionZh: "热门插件", stars: 10, dailyStars: 1,
      weeklyStars: 2, hotScore: 90, forks: 0, openIssues: 0, language: null,
      homepage: null, license: null, topics: [], tags: [], categories: ["tools"], type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "acme-hot", commands: ["dsh plugin --profile web add acme-hot"] },
      sources: [], url: "https://github.com/acme/hot", pushedAt: "", createdAt: "", updatedAt: "",
    };
    const hotRaw = JSON.stringify({
      schemaVersion: 2,
      snapshotId,
      generatedAt,
      snapshotDate: "2026-09-02",
      dataset: "hot",
      total: 1,
      rankings: [catalogEntry],
    });
    const reference = (url: string, content = "{}", count = 0) => ({
      url,
      count,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    });
    const manifest = {
      schemaVersion: 2,
      snapshotId,
      generatedAt,
      snapshotDate: "2026-09-02",
      pageSize: 100,
      definitions: { total: "stars", rising: "growth", hot: "composite" },
      datasets: {
        hot: reference(`${prefix}/hot.json`, hotRaw, 1),
        rising: reference(`${prefix}/rising.json`),
        skills: reference(`${prefix}/skills.json`, "{}", 7),
        search: reference(`${prefix}/search.json`, "{}", 50),
        total: { count: 50, skillCount: 0, pageSize: 100, pageCount: 0, pages: [] },
      },
      categories: [{
        id: "tools", label: "工具", description: "效率工具", count: 12, skillCount: 0,
        pageSize: 100, pageCount: 0, pages: [],
      }],
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      if (value.endsWith(`${prefix}/hot.json`)) return new Response(hotRaw, { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const harness = routeHarness();
    mountRoutes(harness, {
      dataUrl: "https://hot-metadata.example.invalid/data",
      profile: "web",
      profileDirectory: directory,
    });

    const response = await harness.request("/dsh-top100/rankings?view=hot&catalogScope=plugins");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total: 1,
      scopeCounts: { plugins: 50, skills: 7, ecosystem: 0 },
      categories: [{ id: "tools", count: 12 }],
    });
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://hot-metadata.example.invalid/data/manifest.json",
      `https://hot-metadata.example.invalid${prefix}/hot.json`,
    ]);
  });

  it("carries the preflight's exact npm version through the install job", async () => {
    invalidateCatalog();
    clearInstallApprovals();
    clearInstallVerificationCache();
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-route-install-"));
    temporaryProfiles.push(directory);
    writeFileSync(join(directory, "package.json"), `${JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }, null, 2)}\n`);
    writeFileSync(join(directory, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    const catalogEntry = {
      rank: 1, fullName: "acme/fresh", name: "fresh", owner: "acme",
      description: "Fresh plugin", descriptionZh: "新插件", stars: 1, dailyStars: 0,
      weeklyStars: 0, hotScore: 0, forks: 0, openIssues: 0, language: null,
      homepage: null, license: null, topics: [], tags: [], categories: [], type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "fresh", commands: ["dsh plugin --profile web add fresh@latest"] },
      sources: [], url: "https://github.com/acme/fresh", pushedAt: "", createdAt: "", updatedAt: "",
    };
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/rankings.json")) {
        return new Response(JSON.stringify({
          schemaVersion: 2, generatedAt: "2026-08-31T00:00:00Z", snapshotDate: "2026-08-31",
          rankings: { hot: [], rising: [], total: [catalogEntry] },
        }), { status: 200 });
      }
      if (value.includes("registry.npmjs.org/fresh/latest")) {
        return new Response(JSON.stringify({
          name: "fresh", version: "1.2.3", repository: "https://github.com/acme/fresh.git",
          dist: { integrity: "sha512-fresh" }, dsh: { bundle: { patch: "./cordis.patch.yml" } },
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const harness = routeHarness();
    let finishInstall: (() => void) | undefined;
    const runPlugin = vi.fn(() => new Promise<InstallResult>((resolve) => {
      finishInstall = () => resolve(ok());
    }));
    mountRoutes(harness, {
      dataUrl: "https://install-flow.example.invalid/data",
      profile: "web",
      profileDirectory: directory,
    }, { runPlugin, checkProfile: vi.fn(async () => ok()), cancelActive: () => false });

    const detail = await harness.request("/dsh-top100/catalog-entry?fullName=acme%2Ffresh");
    expect(detail.status).toBe(200);
    expect(detail.body.item).toMatchObject({ fullName: "acme/fresh", name: "fresh" });

    const preflight = await harness.request("/dsh-top100/install-preflight", {
      method: "POST", body: { fullName: "acme/fresh" },
    });
    expect(preflight.status).toBe(200);
    expect((preflight.body.provenance as Record<string, unknown>).resolvedTarget).toBe("fresh@1.2.3");
    const accepted = await harness.request("/dsh-top100/install-batch", {
      method: "POST",
      body: { approvals: [{ fullName: "acme/fresh", approvalToken: preflight.body.approvalToken }] },
    });
    expect(accepted.status).toBe(202);
    for (let attempt = 0; attempt < 20 && !finishInstall; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const status = await harness.request("/dsh-top100/status");
    expect(status.body.activeBatches).toEqual([
      expect.objectContaining({ batchId: accepted.body.batchId, completed: 0, total: 1 }),
    ]);
    expect(finishInstall).toBeTypeOf("function");
    finishInstall?.();
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job).toMatchObject({ phase: "installed", activationState: "restart-required" });
    expect(runPlugin).toHaveBeenCalledWith("web", ["add", "fresh@1.2.3"], expect.any(Object));
    expect(readFileSync(join(directory, ".dsh-top100", "provenance.json"), "utf8"))
      .toContain("fresh@1.2.3");
  });

  it("rejects direct installs that bypass immutable-source preflight", async () => {
    const directory = profileFixture("route-preflight-required");
    const harness = routeHarness();
    mountRoutes(harness, { dataUrl: "https://example.invalid/data", profile: "web", profileDirectory: directory });
    const response = await harness.request("/dsh-top100/install", {
      method: "POST",
      body: { fullName: "acme/demo" },
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain("preflight approval");
  });

  it("restores build approval changes and requires a fresh preflight before retrying an install", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-route-rollback-"));
    temporaryProfiles.push(directory);
    writeFileSync(join(directory, "package.json"), `${JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }, null, 2)}\n`);
    const workspaceBefore = "packages:\n  - .\n";
    writeFileSync(join(directory, "pnpm-workspace.yaml"), workspaceBefore);
    const catalogEntry = {
      rank: 1, fullName: "acme/risky", name: "risky", owner: "acme",
      description: "Risky plugin", descriptionZh: "需要构建的插件", stars: 1, dailyStars: 0,
      weeklyStars: 0, hotScore: 0, forks: 0, openIssues: 0, language: null,
      homepage: null, license: null, topics: [], tags: [], categories: [], type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "risky", commands: ["dsh plugin --profile web add risky@latest"] },
      sources: [], url: "https://github.com/acme/risky", pushedAt: "", createdAt: "", updatedAt: "",
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/rankings.json")) {
        return new Response(JSON.stringify({
          schemaVersion: 2, generatedAt: "2026-08-31T00:00:00Z", snapshotDate: "2026-08-31",
          rankings: { hot: [], rising: [], total: [catalogEntry] },
        }), { status: 200 });
      }
      if (value.includes("registry.npmjs.org/risky/latest")) {
        return new Response(JSON.stringify({
          name: "risky", version: "2.0.0", repository: "https://github.com/acme/risky.git",
          dist: { integrity: "sha512-risky" }, dsh: { bundle: { patch: "./cordis.patch.yml" } },
          scripts: { prepare: "npm run build" },
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));
    const harness = routeHarness();
    mountRoutes(harness, {
      dataUrl: "https://rollback.example.invalid/data",
      profile: "web",
      profileDirectory: directory,
    }, {
      runPlugin: vi.fn(async () => ({ ...ok(), exitCode: 1, stderr: "install failed" })),
      checkProfile: vi.fn(async () => ok()),
      cancelActive: () => false,
    });

    const preflight = await harness.request("/dsh-top100/install-preflight", {
      method: "POST", body: { fullName: "acme/risky" },
    });
    const accepted = await harness.request("/dsh-top100/install-batch", {
      method: "POST",
      body: { approvals: [{
        fullName: "acme/risky",
        approvalToken: preflight.body.approvalToken,
        risksAccepted: true,
      }] },
    });
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("failed");
    expect(readFileSync(join(directory, "pnpm-workspace.yaml"), "utf8")).toBe(workspaceBefore);

    const retry = await harness.request("/dsh-top100/retry", {
      method: "POST", body: { jobId: job.id },
    });
    expect(retry.status).toBe(409);
    expect(retry.body.error).toContain("preflight");
  });

  it("validates an update and restores the old lockfile when validation fails", async () => {
    const directory = profileFixture("route-update");
    const harness = routeHarness();
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
      if (args[0] === "add") writeFileSync(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\ncommit: broken-new\n");
      return ok();
    });
    const runtime: PluginCommandRuntime = {
      runPlugin,
      checkProfile: vi.fn(async () => ({ ...ok(), exitCode: 1, stderr: "bad loader config" })),
      cancelActive: () => false,
    };
    mountRoutes(harness, { dataUrl: "https://example.invalid/data.json", profile: "测试 环境", profileDirectory: directory }, runtime);
    const accepted = await harness.request("/dsh-top100/manage", {
      method: "POST",
      body: { action: "update", name: "demo", kind: "bundle" },
    });
    expect(accepted.status).toBe(202);
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("failed");
    expect(job.error).toContain("已自动回滚");
    expect(readFileSync(join(directory, "pnpm-lock.yaml"), "utf8")).toContain("commit: old");
    expect(runPlugin.mock.calls.map((call) => call[1][0])).toEqual(["add", "install"]);
    expect(runPlugin.mock.calls[1]?.[1]).toContain("--frozen-lockfile");
  });

  it("captures loader row ids before remove and cleans the disabled row afterward", async () => {
    const directory = profileFixture("route-uninstall");
    const harness = routeHarness();
    const runtime: PluginCommandRuntime = {
      runPlugin: vi.fn(async (_profile, args) => {
        if (args[0] === "remove") {
          const manifestPath = join(directory, "package.json");
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
          delete manifest.dependencies.demo;
          manifest.dsh.profile.bundles = [];
          writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
          rmSync(join(directory, "node_modules", "demo"), { recursive: true, force: true });
        }
        return ok();
      }),
      cancelActive: () => false,
    };
    mountRoutes(harness, { dataUrl: "https://example.invalid/data.json", profile: "uninstall.profile", profileDirectory: directory }, runtime);
    const accepted = await harness.request("/dsh-top100/manage", {
      method: "POST",
      body: { action: "uninstall", name: "demo", kind: "bundle" },
    });
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("installed");
    expect(readFileSync(join(directory, "cordis.patch.yml"), "utf8")).not.toContain("custom-loader-id");
  });

  it("accepts host-provided in-box bundles during Desktop profile validation", async () => {
    const directory = profileFixture("route-desktop-inbox");
    const manifestPath = join(directory, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.dsh.profile.bundles.unshift("@deepseek-ai/dsh-web-app");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const harness = routeHarness();
    const runtime: PluginCommandRuntime = {
      runPlugin: vi.fn(async () => ok()),
      cancelActive: () => false,
    };
    mountRoutes(harness, { dataUrl: "https://example.invalid/data.json", profile: "desktop", profileDirectory: directory }, runtime);
    const accepted = await harness.request("/dsh-top100/manage", {
      method: "POST",
      body: { action: "update", name: "demo", kind: "bundle" },
    });
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("installed");
  });

  it("refuses uninstall while a user insert still references the package", async () => {
    const directory = profileFixture("route-reference");
    writeFileSync(join(directory, "cordis.patch.yml"), "- insert:\n    - id: user-row\n      name: demo/subpath\n");
    const harness = routeHarness();
    const runPlugin = vi.fn(async () => ok());
    mountRoutes(harness, { dataUrl: "https://example.invalid/data.json", profile: "web", profileDirectory: directory }, {
      runPlugin,
      cancelActive: () => false,
    });
    const response = await harness.request("/dsh-top100/manage", {
      method: "POST",
      body: { action: "uninstall", name: "demo", kind: "bundle" },
    });
    expect(response.status).toBe(409);
    expect(response.body.userPatchReferenced).toBe(true);
    expect(runPlugin).not.toHaveBeenCalled();
  });
});
