import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopPluginRuntime, isCmdSafeProfileName, proxyEnvForPnpm, safeExecArgv, toolSearchDirs } from "../src/install/dsh-cli.js";

afterEach(() => vi.unstubAllGlobals());

describe("safeExecArgv", () => {
  it("preserves loader and diagnostic flags used by source checkouts", () => {
    expect(safeExecArgv(["--import", "tsx/esm", "--trace-warnings"])).toEqual([
      "--import",
      "tsx/esm",
      "--trace-warnings",
    ]);
  });

  it("removes eval, print, and input-type wrapper flags with their values", () => {
    expect(safeExecArgv([
      "--input-type=module",
      "-e",
      "console.log('wrapper')",
      "--eval=another",
      "-p",
      "process.version",
      "--inspect",
    ])).toEqual(["--inspect"]);
  });
});

describe("desktop launch environment", () => {
  it("keeps Unicode profile names argv-safe but rejects cmd expansion syntax", () => {
    expect(isCmdSafeProfileName("测试 profile.1")).toBe(true);
    expect(isCmdSafeProfileName("%TEMP%")).toBe(false);
  });

  it("adds common pnpm locations missing from a GUI app PATH", () => {
    expect(toolSearchDirs("darwin", { PNPM_HOME: "/custom/pnpm" }, "/Users/example"))
      .toEqual(expect.arrayContaining(["/custom/pnpm", "/opt/homebrew/bin", "/Users/example/Library/pnpm"]));
  });

  it("forwards standard proxy variables to pnpm's npm-config variables", () => {
    expect(proxyEnvForPnpm({ HTTPS_PROXY: "http://proxy.example:8080", NO_PROXY: "localhost" }))
      .toMatchObject({
        npm_config_https_proxy: "http://proxy.example:8080",
        npm_config_proxy: "http://proxy.example:8080",
        npm_config_noproxy: "localhost",
      });
  });

  it("routes package operations through Desktop's profile-scoped pnpm service", async () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-desktop-"));
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    const runPlugin = vi.fn((args: readonly string[]) => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdout.end("done\n");
      stderr.end();
      return {
        stdout,
        stderr,
        done: Promise.resolve({ exitCode: 0, signal: null }),
        cancel: vi.fn(),
      };
    });
    const runtime = createDesktopPluginRuntime({ runPlugin }, profile);
    await expect(runtime.runPlugin("桌面 profile", ["remove", "demo"])).resolves.toMatchObject({ exitCode: 0 });
    expect(runPlugin).toHaveBeenCalledWith(["remove", "-w", "demo"], expect.any(String), expect.any(AbortSignal));
    await runtime.dispose?.();
  });

  it("cancels the Desktop-owned operation and marks an explicit user cancellation", async () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-desktop-"));
    let resolveDone!: (value: { exitCode: number | null; signal: NodeJS.Signals | null }) => void;
    const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => { resolveDone = resolve; });
    const cancel = vi.fn(() => resolveDone({ exitCode: null, signal: "SIGTERM" }));
    const runtime = createDesktopPluginRuntime({
      runPlugin: () => ({ stdout: new PassThrough(), stderr: new PassThrough(), done, cancel }),
    }, profile);
    const result = runtime.runPlugin("desktop", ["remove", "demo"]);
    expect(runtime.cancelActive()).toBe(true);
    await expect(result).resolves.toMatchObject({ exitCode: null, cancelled: true, timedOut: false });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("awaits Desktop teardown and rejects reuse of the disposed runtime", async () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-desktop-"));
    let resolveDone!: (value: { exitCode: number | null; signal: NodeJS.Signals | null }) => void;
    const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => { resolveDone = resolve; });
    const cancel = vi.fn(() => resolveDone({ exitCode: null, signal: "SIGTERM" }));
    const runtime = createDesktopPluginRuntime({
      runPlugin: () => ({ stdout: new PassThrough(), stderr: new PassThrough(), done, cancel }),
    }, profile);
    const active = runtime.runPlugin("desktop", ["remove", "demo"]);
    await runtime.dispose?.();
    expect(cancel).toHaveBeenCalledOnce();
    await expect(active).resolves.toMatchObject({ cancelled: false });
    await expect(runtime.runPlugin("desktop", ["remove", "demo"])).resolves.toMatchObject({
      exitCode: 127,
      stderr: expect.stringContaining("disposed"),
    });
  });

  it("uses Desktop's recoverable boundary with the requested npm tag resolved exactly", async () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-desktop-"));
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: "2.0.0" }), { status: 200 })));
    const handle = () => ({
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      cancel: vi.fn(),
    });
    const plain = vi.fn(handle);
    const boundary = vi.fn(handle);
    const runtime = createDesktopPluginRuntime({ runPlugin: plain, runExternalMarketPluginInstall: boundary }, profile);
    await runtime.runPlugin("desktop", ["add", "demo@next"]);
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/demo/next", expect.any(Object));
    expect(plain).not.toHaveBeenCalled();
    expect(boundary.mock.calls[0]?.[0]).toContain("demo@2.0.0");
  });

  it("explains a GitHub-only refusal from an npm-only Desktop boundary", async () => {
    const profile = mkdtempSync(join(tmpdir(), "dsh-top100-desktop-"));
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    const runtime = createDesktopPluginRuntime({
      runPlugin() { throw new Error("plugin add must use the recoverable install boundary"); },
      runExternalMarketPluginInstall() { throw new Error("must not be called"); },
    }, profile);
    await expect(runtime.runPlugin("desktop", ["add", "github:acme/demo"])).resolves.toMatchObject({
      exitCode: 127,
      stderr: expect.stringContaining("GitHub-only"),
    });
  });
});
