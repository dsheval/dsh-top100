import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebServerService } from "../src/host/contracts.js";
import { mountRoutes } from "../src/host/routes.js";
import { invalidateCatalog } from "../src/host/catalog.js";
import { clearUpdateApprovals } from "../src/host/update-preflight.js";
import { clearInstallApprovals, createInstallPreflight } from "../src/host/install-preflight.js";
import { clearInstallVerificationCache } from "../src/install/install-verify.js";
import type { InstallResult, RankingEntry } from "../src/shared/types.js";
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
  clearUpdateApprovals();
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
  const request = async (path: string, options: { method?: string; body?: unknown; loseResponse?: boolean } = {}) => {
    const stream = Readable.from(options.body === undefined ? [] : [Buffer.from(JSON.stringify(options.body))]);
    Object.assign(stream, {
      method: options.method ?? "GET",
      url: path,
      headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" },
    });
    let status = 0;
    let output = "";
    const response = Object.assign(new EventEmitter(), {
      writeHead(code: number) { status = code; return response; },
      end(chunk?: string | Buffer) { if (options.loseResponse) throw new Error("response connection lost"); output += chunk?.toString() ?? ""; return response; },
    }) as unknown as ServerResponse;
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

function writeDemoVersion(directory: string, version: string): void {
  const path = join(directory, "node_modules", "demo", "package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.version = version;
  writeFileSync(path, JSON.stringify(manifest));
}

async function updateApproval(harness: ReturnType<typeof routeHarness>, directory: string) {
  const path = join(directory, "package.json");
  const profile = JSON.parse(readFileSync(path, "utf8"));
  profile.dependencies.demo = "1.0.0";
  writeFileSync(path, JSON.stringify(profile));
  writeDemoVersion(directory, "1.0.0");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./cordis.patch.yml" } },
    dist: { integrity: "sha512-demo-test" }, repository: "https://github.com/acme/demo",
  }))));
  const result = await harness.request("/dsh-top100/update-preflight", { method: "POST", body: { names: ["demo"] } });
  expect(result.status).toBe(200);
  const items = result.body.items as Array<{ name: string; preflight: { approvalToken: string } }>;
  return items.map((item) => ({ name: item.name, approvalToken: item.preflight.approvalToken, risksAccepted: true }));
}

async function freshInstallApproval(profile = "web") {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    name: "fresh", version: "1.2.3", repository: "https://github.com/acme/fresh.git",
    dist: { integrity: "sha512-fresh" }, dsh: { bundle: { patch: "./cordis.patch.yml" } },
  }))));
  const approval = await createInstallPreflight({
    rank: 1, fullName: "acme/fresh", name: "fresh", owner: "acme",
    description: "Fresh", descriptionZh: "插件", stars: 1, dailyStars: 0,
    weeklyStars: 0, hotScore: 0, forks: 0, openIssues: 0, language: null,
    homepage: null, license: null, topics: [], tags: [], type: "cordis-plugin",
    install: { packageName: "fresh", commands: ["dsh plugin add fresh@latest"] },
    sources: [], url: "https://github.com/acme/fresh", pushedAt: "", createdAt: "", updatedAt: "",
  } satisfies RankingEntry, profile);
  return { fullName: "acme/fresh", approvalToken: approval.preflight.approvalToken, risksAccepted: true };
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
  it.each([true, false])("checks existing installations only after the prior transaction finishes (first fails=%s)", async (firstFails) => {
    const directory = profileFixture("queued-install");
    const harness = routeHarness();
    const approvals = [await freshInstallApproval(), await freshInstallApproval()];
    let release: (() => void) | undefined;
    let adds = 0;
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
      if (args[0] === "install") {
        rmSync(join(directory, "node_modules", "fresh"), { recursive: true, force: true });
        return ok();
      }
      adds++;
      const path = join(directory, "package.json");
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      manifest.dependencies.fresh = "1.2.3";
      writeFileSync(path, JSON.stringify(manifest));
      mkdirSync(join(directory, "node_modules", "fresh"), { recursive: true });
      writeFileSync(join(directory, "node_modules", "fresh", "package.json"), JSON.stringify({ name: "fresh", version: "1.2.3" }));
      if (adds === 1) {
        await new Promise<void>((resolve) => { release = resolve; });
        if (firstFails) return { ...ok(), exitCode: 1, stderr: "postinstall failed" };
      }
      return ok();
    });
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" }, {
      runPlugin, checkProfile: async () => ok(), cancelActive: () => false,
    });
    const first = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { approvals: [approvals[0]] } });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const second = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { approvals: [approvals[1]] } });
    expect((second.body.jobs as Array<{ phase: string }>)[0].phase).toBe("waiting-profile-lock");
    release!();
    expect((await waitForBatch(harness.request, String(first.body.batchId))).phase).toBe(firstFails ? "failed" : "installed");
    const final = await waitForBatch(harness.request, String(second.body.batchId));
    expect(final.phase).toBe("installed");
    expect(final.message).toBe(firstFails ? "installed" : "already installed");
    expect(adds).toBe(firstFails ? 2 : 1);
    expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).dependencies.fresh).toBe("1.2.3");
  });

  it.each(["install", "install-batch", "manage"])("reconciles and replays %s submissions exactly once, including terminal results", async (endpoint) => {
    const directory = profileFixture("submission-replay");
    const harness = routeHarness();
    const runPlugin = vi.fn(async () => { if (endpoint === "manage") writeDemoVersion(directory, "2.0.0"); return ok(); });
    const config = { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" };
    mountRoutes(harness, config, { runPlugin, checkProfile: async () => ok(), cancelActive: () => false });
    const approval = endpoint === "manage" ? null : await freshInstallApproval();
    const submissionId = `replay-${endpoint}`;
    const body = endpoint === "manage"
      ? { action: "update", names: ["demo"], approvals: await updateApproval(harness, directory), submissionId }
      : endpoint === "install" ? { ...approval, submissionId } : { approvals: [approval], submissionId };
    const [accepted, replay] = await Promise.all([
      harness.request(`/dsh-top100/${endpoint}`, { method: "POST", body }),
      harness.request(`/dsh-top100/${endpoint}`, { method: "POST", body }),
    ]);
    expect(accepted.status).toBe(202); expect(replay.status).toBe(202);
    expect(replay.body.batchId).toBe(accepted.body.batchId);
    expect((await waitForBatch(harness.request, String(accepted.body.batchId))).phase).toBe("installed");
    const recovered = await harness.request(`/dsh-top100/status?submissionId=${submissionId}`);
    expect(recovered.body.submission).toMatchObject({ batchId: accepted.body.batchId, completed: 1 });
    const again = await harness.request(`/dsh-top100/${endpoint}`, { method: "POST", body });
    expect(again.status).toBe(202); expect(again.body.completed).toBe(1);
    const conflicting = await harness.request(`/dsh-top100/${endpoint}`, { method: "POST", body: { ...body, force: true } });
    expect(conflicting.status).toBe(409);
    expect(runPlugin).toHaveBeenCalledTimes(1);
    const elsewhere = routeHarness();
    mountRoutes(elsewhere, { ...config, profileDirectory: profileFixture("different-profile-directory") });
    expect((await elsewhere.request(`/dsh-top100/status?submissionId=${submissionId}`)).body.submission).toBeNull();
  });

  it.each(["missing-package", "malformed-bundle-patch", "forced-user-patch"])("can remove a broken package without guessing or rewriting unreadable cleanup state: %s", async (mode) => {
    const directory = profileFixture("broken-uninstall"); const harness = routeHarness();
    if (mode === "missing-package") rmSync(join(directory, "node_modules", "demo"), { recursive: true, force: true });
    if (mode === "malformed-bundle-patch") writeFileSync(join(directory, "node_modules", "demo", "cordis.patch.yml"), "[broken");
    if (mode === "forced-user-patch") writeFileSync(join(directory, "cordis.patch.yml"), "[broken");
    const original = readFileSync(join(directory, "cordis.patch.yml"), "utf8");
    const runPlugin = vi.fn(async () => {
      rmSync(join(directory, "node_modules", "demo"), { recursive: true, force: true });
      return ok();
    });
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" }, { runPlugin, checkProfile: async () => ok(), cancelActive: () => false });
    if (mode === "forced-user-patch") {
      const blocked = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "uninstall", name: "demo" } });
      expect(blocked.status).toBe(409); expect(runPlugin).not.toHaveBeenCalled();
    }
    const accepted = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "uninstall", name: "demo", force: mode === "forced-user-patch" } });
    expect(accepted.status).toBe(202);
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job).toMatchObject({ phase: "installed", message: "uninstalled" });
    expect(job.lastLine).toContain("保留");
    expect(readFileSync(join(directory, "cordis.patch.yml"), "utf8")).toBe(original);
    expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).dependencies.demo).toBeUndefined();
  });

  it("retains acceptance when writing the POST response fails", async () => {
    const directory = profileFixture("lost-response"); const harness = routeHarness();
    const runPlugin = vi.fn(async () => ok());
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" }, { runPlugin, checkProfile: async () => ok(), cancelActive: () => false });
    const body = { submissionId: "lost-response", approvals: [await freshInstallApproval()] };
    await expect(harness.request("/dsh-top100/install-batch", { method: "POST", body, loseResponse: true })).rejects.toThrow("connection lost");
    const status = await harness.request(`/dsh-top100/status?submissionId=${body.submissionId}`);
    const recovered = status.body.submission as { batchId: string };
    expect(recovered.batchId).toBeTypeOf("string");
    await waitForBatch(harness.request, recovered.batchId);
    const replay = await harness.request("/dsh-top100/install-batch", { method: "POST", body });
    expect(replay.body.batchId).toBe(recovered.batchId); expect(runPlugin).toHaveBeenCalledTimes(1);
  });

  it("replays an uninstall retry instead of creating a second removal", async () => {
    const directory = profileFixture("retry-submission"); const harness = routeHarness();
    let calls = 0;
    const runPlugin = vi.fn(async () => {
      calls++;
      if (calls === 1) return { ...ok(), exitCode: 1, stderr: "transient removal failure" };
      const path = join(directory, "package.json"); const manifest = JSON.parse(readFileSync(path, "utf8"));
      delete manifest.dependencies.demo; manifest.dsh.profile.bundles = [];
      writeFileSync(path, JSON.stringify(manifest));
      rmSync(join(directory, "node_modules", "demo"), { recursive: true, force: true });
      return ok();
    });
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" }, { runPlugin, checkProfile: async () => ok(), cancelActive: () => false });
    const first = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "uninstall", name: "demo" } });
    const failed = await waitForBatch(harness.request, String(first.body.batchId)); expect(failed.phase).toBe("failed");
    const body = { submissionId: "retry-remove", jobId: failed.id };
    const accepted = await harness.request("/dsh-top100/retry", { method: "POST", body });
    const replay = await harness.request("/dsh-top100/retry", { method: "POST", body });
    expect(accepted.status).toBe(202); expect(replay.body.batchId).toBe(accepted.body.batchId);
    expect((await waitForBatch(harness.request, String(accepted.body.batchId))).phase).toBe("installed");
    expect(runPlugin).toHaveBeenCalledTimes(2);
  });

  it("cancels an unknown submission before a late POST without consuming its approval", async () => {
    const directory = profileFixture("cancel-late-submission"); const harness = routeHarness();
    const runPlugin = vi.fn(async () => ok());
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" }, { runPlugin, checkProfile: async () => ok(), cancelActive: () => false });
    const approval = await freshInstallApproval();
    const cancelled = await harness.request("/dsh-top100/cancel-submission", { method: "POST", body: { submissionId: "late" } });
    expect(cancelled.body).toEqual({ cancelled: true, submission: null });
    const late = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { submissionId: "late", approvals: [approval] } });
    expect(late.status).toBe(409); expect(runPlugin).not.toHaveBeenCalled();
    expect((await harness.request("/dsh-top100/status?submissionId=late")).body.submissionCancelled).toBe(true);
    const fresh = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { submissionId: "new", approvals: [approval] } });
    expect(fresh.status).toBe(202);
    await waitForBatch(harness.request, String(fresh.body.batchId));
  });

  it("cancels an accepted submission and keeps its recovery result queryable", async () => {
    const directory = profileFixture("cancel-accepted-submission"); const harness = routeHarness();
    let release: (() => void) | undefined;
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
      if (args[0] === "add") { await new Promise<void>((resolve) => { release = resolve; }); return { ...ok(), exitCode: 1, cancelled: true }; }
      return ok();
    });
    const cancelActive = vi.fn(() => true);
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid" }, { runPlugin, checkProfile: async () => ok(), cancelActive });
    const body = { submissionId: "accepted-cancel", approvals: [await freshInstallApproval()] };
    const accepted = await harness.request("/dsh-top100/install-batch", { method: "POST", body });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const cancelled = await harness.request("/dsh-top100/cancel-submission", { method: "POST", body: { submissionId: body.submissionId } });
    expect(cancelled.body.submission).toMatchObject({ batchId: accepted.body.batchId, completed: 0 });
    expect(cancelActive).toHaveBeenCalledTimes(1);
    release!();
    expect((await waitForBatch(harness.request, String(accepted.body.batchId))).phase).toBe("cancelled");
    const status = await harness.request(`/dsh-top100/status?submissionId=${body.submissionId}`);
    expect(status.body.submissionCancelled).toBe(true);
    expect(status.body.submission).toMatchObject({ completed: 1, jobs: [expect.objectContaining({ phase: "cancelled" })] });
    const replay = await harness.request("/dsh-top100/install-batch", { method: "POST", body });
    expect(replay.status).toBe(202); expect(replay.body.batchId).toBe(accepted.body.batchId);
    expect(runPlugin.mock.calls.map((call) => call[1][0])).toEqual(["add", "install"]);
  });

  it.each(["add-failure", "add-cancel", "post-check-cancel", "recovery-failure", "recovery-residue"])(
    "recovers the actual dependency tree on first install: %s", async (scenario) => {
      const directory = profileFixture("first-install-transaction");
      writeDemoVersion(directory, "1.0.0");
      const manifestBefore = readFileSync(join(directory, "package.json"), "utf8");
      const lockBefore = readFileSync(join(directory, "pnpm-lock.yaml"), "utf8");
      const harness = routeHarness();
      let releaseOperation: (() => void) | undefined;
      let releaseRecovery: (() => void) | undefined;
      let checks = 0;
      const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
        if (args[0] === "add") {
          // The manifest can remain unchanged while pnpm has already mutated files.
          writeDemoVersion(directory, "2.0.0");
          mkdirSync(join(directory, "node_modules", "fresh"), { recursive: true });
          writeFileSync(join(directory, "node_modules", "fresh", "package.json"), JSON.stringify({ name: "fresh", version: "1.2.3" }));
          writeFileSync(join(directory, "pnpm-lock.yaml"), "changed by add");
          if (scenario === "add-cancel") await new Promise<void>((resolve) => { releaseOperation = resolve; });
          return scenario === "post-check-cancel" ? ok() : { ...ok(), exitCode: 1, cancelled: scenario === "add-cancel", stderr: "add interrupted" };
        }
        expect(args).toEqual(["install", "--frozen-lockfile"]);
        expect(readFileSync(join(directory, "pnpm-lock.yaml"), "utf8")).toBe(lockBefore);
        await new Promise<void>((resolve) => { releaseRecovery = resolve; });
        if (scenario === "recovery-failure") return { ...ok(), exitCode: 1, stderr: "restore failed" };
        if (scenario !== "recovery-residue") writeDemoVersion(directory, "1.0.0");
        rmSync(join(directory, "node_modules", "fresh"), { recursive: true, force: true });
        return ok();
      });
      const cancelActive = vi.fn(() => true);
      mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid/data" }, {
        runPlugin, cancelActive,
        checkProfile: async () => {
          checks += 1;
          if (scenario === "post-check-cancel" && checks === 2) {
            await new Promise<void>((resolve) => { releaseOperation = resolve; });
            return { ...ok(), cancelled: true };
          }
          return ok();
        },
      });
      const accepted = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { approvals: [await freshInstallApproval()] } });
      expect(accepted.status).toBe(202);
      const jobId = (accepted.body.jobs as Array<{ id: string }>)[0].id;
      if (scenario === "add-cancel" || scenario === "post-check-cancel") {
        await vi.waitFor(() => expect(releaseOperation).toBeTypeOf("function"));
        await harness.request("/dsh-top100/cancel", { method: "POST", body: { jobId } });
        expect(cancelActive).toHaveBeenCalledTimes(scenario === "add-cancel" ? 1 : 0);
        releaseOperation!();
      }
      await vi.waitFor(() => expect(releaseRecovery).toBeTypeOf("function"));
      // A second legacy cancel must never kill the repair command.
      cancelActive.mockClear();
      if (scenario === "add-cancel" || scenario === "post-check-cancel") {
        await harness.request("/dsh-top100/cancel", { method: "POST", body: {} });
        expect(cancelActive).not.toHaveBeenCalled();
      }
      releaseRecovery!();
      const job = await waitForBatch(harness.request, String(accepted.body.batchId));
      const recoveryFailed = scenario.startsWith("recovery-");
      expect(job.phase).toBe(scenario.endsWith("cancel") ? "cancelled" : "failed");
      expect(job.activationState).toBe(recoveryFailed ? "broken" : "restart-required");
      expect(job.error).toContain(recoveryFailed ? "自动恢复失败" : "已自动回滚");
      expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))).toEqual(JSON.parse(manifestBefore));
      if (!recoveryFailed) {
        expect(JSON.parse(readFileSync(join(directory, "node_modules", "demo", "package.json"), "utf8")).version).toBe("1.0.0");
        expect(() => readFileSync(join(directory, "node_modules", "fresh", "package.json"))).toThrow();
      }
      expect(() => readFileSync(join(directory, ".dsh-top100", "provenance.json"))).toThrow();
      expect(runPlugin.mock.calls.map((call) => call[1])).toEqual([["add", "fresh@1.2.3"], ["install", "--frozen-lockfile"]]);
    },
  );

  it.each([null, { fullName: "acme/invalid", approvalToken: "invalid-token" }])(
    "rejects an entire invalid install batch without consuming its valid token: %s", async (invalid) => {
      const directory = profileFixture("atomic-install");
      const harness = routeHarness();
      const runPlugin = vi.fn(async () => ok());
      mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid/data" }, {
        runPlugin, checkProfile: async () => ok(), cancelActive: () => false,
      });
      const approval = await freshInstallApproval();
      const rejected = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { approvals: [approval, invalid] } });
      expect(rejected.status).toBe(400);
      expect(runPlugin).not.toHaveBeenCalled();
      const accepted = await harness.request("/dsh-top100/install-batch", { method: "POST", body: { approvals: [approval] } });
      expect(accepted.status).toBe(202);
      expect((await waitForBatch(harness.request, String(accepted.body.batchId))).phase).toBe("installed");
    },
  );

  it("accepts twenty long scoped update names and approvals while retaining a bounded body limit", async () => {
    const directory = profileFixture("batch-body-size");
    const names = Array.from({ length: 20 }, (_, i) => `@example-org/dsh-workflow-${String(i).padStart(2, "0")}-integration-plugin-provider-bridge`);
    const profilePath = join(directory, "package.json");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    for (const name of names) {
      profile.dependencies[name] = "1.0.0";
      mkdirSync(join(directory, "node_modules", name), { recursive: true });
      writeFileSync(join(directory, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
    }
    writeFileSync(profilePath, JSON.stringify(profile));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const name = decodeURIComponent(new URL(url).pathname.slice(1).replace(/\/latest$/, ""));
      return new Response(JSON.stringify({ name, version: "2.0.0", dist: { integrity: "sha512-test" }, dsh: { bundle: { patch: "./cordis.patch.yml" } } }));
    }));
    const harness = routeHarness();
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
      const name = args[1].slice(0, args[1].lastIndexOf("@"));
      writeFileSync(join(directory, "node_modules", name, "package.json"), JSON.stringify({ name, version: "2.0.0" }));
      return ok();
    });
    mountRoutes(harness, { profile: "web", profileDirectory: directory, dataUrl: "https://unused.invalid/data" }, {
      runPlugin, checkProfile: async () => ok(), cancelActive: () => false,
    });
    const preflight = await harness.request("/dsh-top100/update-preflight", { method: "POST", body: { names } });
    expect(preflight.status).toBe(200);
    const approvals = (preflight.body.items as Array<{ name: string; preflight: { approvalToken: string } }>).map((item) => ({
      name: item.name, approvalToken: item.preflight.approvalToken, risksAccepted: true,
    }));
    const body = { action: "update", names, approvals };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(4096);
    const accepted = await harness.request("/dsh-top100/manage", { method: "POST", body });
    expect(accepted.status).toBe(202);
    await vi.waitFor(async () => {
      const batch = await harness.request(`/dsh-top100/install-jobs?batchId=${accepted.body.batchId}`);
      expect((batch.body.jobs as Array<{ phase: string }>).map((job) => job.phase)).toEqual(names.map(() => "installed"));
    });
    expect(runPlugin).toHaveBeenCalledTimes(20);
    const oversized = await harness.request("/dsh-top100/manage", { method: "POST", body: { ...body, padding: "x".repeat(32768) } });
    expect(oversized.status).toBe(400);
    expect(oversized.body.error).toContain("body too large");
  });

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
      rank: 1, totalRank: 27, fullName: "acme/hot", name: "hot", owner: "acme",
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
      items: [expect.objectContaining({ installLocator: { snapshotId, totalRank: 27 } })],
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
      if (args[0] === "add") {
        writeFileSync(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\ncommit: broken-new\n");
        writeDemoVersion(directory, "2.0.0");
      } else writeDemoVersion(directory, "1.0.0");
      return ok();
    });
    const runtime: PluginCommandRuntime = {
      runPlugin,
      checkProfile: vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce({ ...ok(), exitCode: 1, stderr: "bad loader config" }).mockResolvedValueOnce(ok()),
      cancelActive: () => false,
    };
    mountRoutes(harness, { dataUrl: "https://example.invalid/data.json", profile: "测试 环境", profileDirectory: directory }, runtime);
    const accepted = await harness.request("/dsh-top100/manage", {
      method: "POST",
      body: { action: "update", name: "demo", kind: "bundle", approvals: await updateApproval(harness, directory) },
    });
    expect(accepted.status).toBe(202);
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("failed");
    expect(job.error).toContain("已自动回滚");
    expect(readFileSync(join(directory, "pnpm-lock.yaml"), "utf8")).toContain("commit: old");
    expect(runPlugin.mock.calls.map((call) => call[1][0])).toEqual(["add", "install"]);
    expect(runPlugin.mock.calls[1]?.[1]).toContain("--frozen-lockfile");
  });

  it("requires fresh approval before updates and records the confirmed immutable source", async () => {
    const directory = profileFixture("update-approval");
    const harness = routeHarness();
    const runPlugin = vi.fn(async (_profile: string, _args: string[]) => { writeDemoVersion(directory, "2.0.0"); return ok(); });
    mountRoutes(harness, { dataUrl: "https://example.invalid/data", profile: "web", profileDirectory: directory }, {
      runPlugin, checkProfile: async () => ok(), cancelActive: () => false,
    });
    const denied = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "update", name: "demo" } });
    expect(denied.status).toBe(409);
    expect(runPlugin).not.toHaveBeenCalled();
    const approvals = await updateApproval(harness, directory);
    const response = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "update", name: "demo", approvals } });
    const job = await waitForBatch(harness.request, String(response.body.batchId));
    expect(job.phase).toBe("installed");
    expect(runPlugin.mock.calls[0]?.[1]).toEqual(["add", "demo@2.0.0"]);
    expect(job.provenance).toMatchObject({ resolvedTarget: "demo@2.0.0" });
    const ledger = readFileSync(join(directory, ".dsh-top100", "provenance.json"), "utf8");
    expect(ledger).toContain("demo@2.0.0");
    expect(ledger).not.toContain(approvals[0].approvalToken);
  });

  it("rejects stale update approval before queueing any command", async () => {
    const directory = profileFixture("update-stale");
    const harness = routeHarness();
    const runPlugin = vi.fn(async () => ok());
    mountRoutes(harness, { dataUrl: "https://example.invalid/data", profile: "web", profileDirectory: directory }, {
      runPlugin, checkProfile: async () => ok(), cancelActive: () => false,
    });
    const approvals = await updateApproval(harness, directory);
    writeDemoVersion(directory, "1.5.0");
    const response = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "update", name: "demo", approvals } });
    expect(response.status).toBe(409);
    expect(runPlugin).not.toHaveBeenCalled();
  });

  it.each([
    { recoveryFails: false, manifestChanged: true },
    { recoveryFails: true, manifestChanged: true },
    { recoveryFails: false, manifestChanged: false },
  ])("restores files after cancellation (recovery failure: $recoveryFails, changed manifest: $manifestChanged)", async ({ recoveryFails, manifestChanged }) => {
    const directory = profileFixture("update-cancel");
    const originalWorkspace = readFileSync(join(directory, "pnpm-workspace.yaml"), "utf8");
    const harness = routeHarness();
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
      if (args[0] === "add") {
        const path = join(directory, "package.json");
        const profile = JSON.parse(readFileSync(path, "utf8"));
        profile.dependencies.demo = "2.0.0";
        if (manifestChanged) {
          writeFileSync(path, JSON.stringify(profile));
          writeFileSync(join(directory, "pnpm-lock.yaml"), "changed lockfile");
          writeFileSync(join(directory, "pnpm-workspace.yaml"), "allowBuilds: { demo: true }");
        }
        writeDemoVersion(directory, "2.0.0");
        return { ...ok(), cancelled: true, exitCode: 1 };
      }
      if (recoveryFails) return { ...ok(), exitCode: 1, stderr: "recovery offline" };
      writeDemoVersion(directory, "1.0.0");
      return ok();
    });
    mountRoutes(harness, { dataUrl: "https://example.invalid/data", profile: "web", profileDirectory: directory }, {
      runPlugin, checkProfile: async () => ok(), cancelActive: () => true,
    });
    const approvals = await updateApproval(harness, directory);
    const accepted = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "update", name: "demo", approvals } });
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe(recoveryFails ? "failed" : "cancelled");
    expect(job.activationState).toBe(recoveryFails ? "broken" : "restart-required");
    expect(job.error).toContain(recoveryFails ? "自动恢复失败" : "已自动回滚");
    expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).dependencies.demo).toBe("1.0.0");
    expect(readFileSync(join(directory, "pnpm-lock.yaml"), "utf8")).toContain("commit: old");
    expect(readFileSync(join(directory, "pnpm-workspace.yaml"), "utf8")).toBe(originalWorkspace);
    expect(runPlugin.mock.calls[1][1]).toEqual(["install", "--frozen-lockfile"]);
    const retry = await harness.request("/dsh-top100/retry", { method: "POST", body: { jobId: job.id } });
    expect(retry.status).toBe(409);
  });

  it("never relaxes the saved lockfile when recovery encounters pnpm hoist drift", async () => {
    const directory = profileFixture("update-strict-recovery");
    const harness = routeHarness();
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => ({
      ...ok(), exitCode: 1, stderr: args[0] === "add" ? "update failed" : "ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF",
    }));
    mountRoutes(harness, { dataUrl: "https://example.invalid/data", profile: "web", profileDirectory: directory }, {
      runPlugin, checkProfile: async () => ok(), cancelActive: () => false,
    });
    const approvals = await updateApproval(harness, directory);
    const accepted = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "update", name: "demo", approvals } });
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("failed");
    expect(job.error).toContain("自动恢复失败");
    expect(runPlugin.mock.calls.map((call) => call[1])).toEqual([["add", "demo@2.0.0"], ["install", "--frozen-lockfile"]]);
  });

  it("routes legacy cancellation through the job and never interrupts update recovery", async () => {
    const directory = profileFixture("update-recovery-cancel");
    const harness = routeHarness();
    let releaseRecovery!: () => void;
    let recoveryStarted = false;
    const runPlugin = vi.fn(async (_profile: string, args: string[]) => {
      if (args[0] === "add") { writeDemoVersion(directory, "2.0.0"); return { ...ok(), exitCode: 1 }; }
      recoveryStarted = true;
      await new Promise<void>((resolve) => { releaseRecovery = resolve; });
      writeDemoVersion(directory, "1.0.0");
      return ok();
    });
    const cancelActive = vi.fn(() => true);
    mountRoutes(harness, { dataUrl: "https://example.invalid/data", profile: "web", profileDirectory: directory }, {
      runPlugin, checkProfile: async () => ok(), cancelActive,
    });
    const approvals = await updateApproval(harness, directory);
    const accepted = await harness.request("/dsh-top100/manage", { method: "POST", body: { action: "update", name: "demo", approvals } });
    await vi.waitFor(() => expect(recoveryStarted).toBe(true));
    try {
      const cancelled = await harness.request("/dsh-top100/cancel", { method: "POST", body: {} });
      expect(cancelled.body.cancelled).toBe(true);
      expect(cancelActive).not.toHaveBeenCalled();
    } finally { releaseRecovery(); }
    const job = await waitForBatch(harness.request, String(accepted.body.batchId));
    expect(job.phase).toBe("cancelled");
    expect(job.error).toContain("已自动回滚");
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
      runPlugin: vi.fn(async () => { writeDemoVersion(directory, "2.0.0"); return ok(); }),
      cancelActive: () => false,
    };
    mountRoutes(harness, { dataUrl: "https://example.invalid/data.json", profile: "desktop", profileDirectory: directory }, runtime);
    const accepted = await harness.request("/dsh-top100/manage", {
      method: "POST",
      body: { action: "update", name: "demo", kind: "bundle", approvals: await updateApproval(harness, directory) },
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
