import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopPluginRuntime, isCmdSafeProfileName, progress, proxyEnvForPnpm, safeExecArgv, toolSearchDirs } from "../src/install/dsh-cli.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
  it("keeps progress lines intact across chunks and separate output streams", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let finish!: () => void;
    const done = new Promise<{ exitCode: number; signal: null }>((resolve) => { finish = () => resolve({ exitCode: 0, signal: null }); });
    const runtime = createDesktopPluginRuntime({
      runPlugin: () => ({ stdout, stderr, done, cancel: vi.fn() }),
    }, mkdtempSync(join(tmpdir(), "dsh-top100-progress-")));
    const result = runtime.runPlugin("desktop", ["remove", "demo"]);
    stdout.write("Progress: resolved 174, reused 157, down");
    stderr.write("Network ");
    stdout.write("loaded 10, added 167\r");
    expect(progress.lastLine).toBe("Progress: resolved 174, reused 157, downloaded 10, added 167");
    stdout.write("\n");
    expect(progress.lastLine).toContain("Progress:");
    stderr.write("retry\n");
    expect(progress.lastLine).toBe("Network retry");
    const unicode = Buffer.from("依赖已恢复\n");
    stdout.write(unicode.subarray(0, 2));
    stdout.write(unicode.subarray(2));
    expect(progress.lastLine).toBe("依赖已恢复");
    stdout.write("final output without newline");
    expect(progress.lastLine).toBe("依赖已恢复");
    finish();
    await result;
    expect(progress.lastLine).toBe("final output without newline");
    await runtime.dispose?.();
  });

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

  it("does not start an exact npm install after disposal during preparation", async () => {
    const start = vi.fn(() => ({ stdout: new PassThrough(), stderr: new PassThrough(),
      done: Promise.resolve({ exitCode: 0, signal: null }), cancel: vi.fn() }));
    const runtime = createDesktopPluginRuntime({ runPlugin: start, runExternalMarketPluginInstall: start }, mkdtempSync(join(tmpdir(), "dsh-top100-desktop-")));
    const result = runtime.runPlugin("desktop", ["add", "demo@1.0.0"]);
    await runtime.dispose?.();
    expect(start).not.toHaveBeenCalled();
    await expect(result).resolves.toMatchObject({ exitCode: 127, cancelled: false, stderr: "disposed" });
    expect(runtime.cancelActive()).toBe(false);
  });

  it.each(["cancel", "dispose", "timeout"] as const)("aborts pending npm resolution on %s without starting the host command", async (action) => {
    vi.useFakeTimers();
    let requestSignal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal.addEventListener("abort", () => reject(requestSignal.reason), { once: true });
      });
    }));
    const start = vi.fn(() => { throw new Error("must not run"); });
    const runtime = createDesktopPluginRuntime({ runPlugin: start, runExternalMarketPluginInstall: start }, mkdtempSync(join(tmpdir(), "dsh-top100-desktop-")), process.cwd(), 100);
    const result = runtime.runPlugin("desktop", ["add", "demo@next"]);
    if (action === "cancel") expect(runtime.cancelActive()).toBe(true);
    else if (action === "dispose") await runtime.dispose?.();
    else await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toMatchObject({ exitCode: 127, cancelled: action === "cancel", timedOut: action === "timeout" });
    expect(requestSignal.aborted).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(runtime.cancelActive()).toBe(false);
    await runtime.dispose?.();
  });

  it("cancels and awaits a handle returned during reentrant host disposal", async () => {
    let finish!: (value: { exitCode: number | null; signal: NodeJS.Signals | null }) => void;
    const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => { finish = resolve; });
    let disposed!: Promise<void>;
    const cancel = vi.fn(() => { finish({ exitCode: null, signal: "SIGTERM" }); });
    const runtime = createDesktopPluginRuntime({ runPlugin: () => {
      disposed = runtime.dispose!();
      return { stdout: new PassThrough(), stderr: new PassThrough(), done, cancel };
    } }, mkdtempSync(join(tmpdir(), "dsh-top100-desktop-")));
    const result = runtime.runPlugin("desktop", ["remove", "demo"]);
    await disposed;
    await expect(result).resolves.toMatchObject({ exitCode: null, cancelled: false });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
