import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { WebServerService } from "../src/host/contracts.js";
import { mountRoutes } from "../src/host/routes.js";
import type { InstallResult } from "../src/shared/types.js";
import type { PluginCommandRuntime } from "../src/install/dsh-cli.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

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
