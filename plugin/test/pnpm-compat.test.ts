import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { classifyInstallFailure, classifyPnpmFailure, pluginArgsFor, withPnpmRecovery } from "../src/install/pnpm-compat.js";
import type { InstallResult } from "../src/shared/types.js";

function result(overrides: Partial<InstallResult>): InstallResult {
  return { exitCode: 1, timedOut: false, stdout: "", stderr: "", cancelled: false, ...overrides };
}

// Reduced from Top100 #9/#22/#50/#94 evidence. Preceding network warnings
// must not hide a final policy or source-build failure.
const ignoredBuilds = `[WARN] GET https://registry.npmjs.org/demo error (ENOTFOUND). Will retry.
[WARN] Issues with peer dependencies found.
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: cloudflared@0.7.3, cpu-features@0.0.10, node-pty@1.1.0, ssh2@1.17.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.`;
const gitTimeout = "[WARN] HEAD https://github.com/beiyege-01/dsh-voice-ai-girlfriend-plugin error (UND_ERR_CONNECT_TIMEOUT). Will retry in 1 second. 1 retries left.";
const prepareFailure = `GET https://registry.npmjs.org/demo error (ETIMEDOUT). Will retry.
... pnpm-install: . prepare: lib/client.js: BUILD_ID not found
... pnpm-install: . prepare: [ELIFECYCLE] Command failed with exit code 1.
... pnpm-install: . prepare: Failed
[ERR_PNPM_PREPARE_PACKAGE] Failed to prepare git-hosted package fetched from "https://codeload.github.com/fb0sh/dsh-pentester/tar.gz/64bb99abc53132fa0bfff63e8ec0d94f685507ae"`;

describe("pnpm failure summaries", () => {
  it.each([
    [ignoredBuilds, "ignored-builds"],
    [gitTimeout, "git-network"],
    [prepareFailure, "prepare-failed"],
    ["git ls-remote https://github.com/owner/repo HEAD\nfatal: unable to access: Connection timed out", "git-network"],
    ["[ERR_PNPM_PEER_DEP_ISSUES] Unmet peer dependencies", "peer-dependency"],
    ["[ELIFECYCLE] node-gyp rebuild failed with exit code 1", "lifecycle-failed"],
    ["The operation was aborted due to timeout", "fetch-timeout"],
    ["[ERR_PNPM_FETCH_503] GET registry request failed", "transient-network"],
    ["[ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF] modules layout differs", "hoist-drift"],
    ["[ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF] modules layout differs", "hoist-drift"],
    ["The release is too new: minimumReleaseAge", "release-age"],
  ])("classifies %s as %s", (output, code) => {
    expect(classifyPnpmFailure(output)?.code).toBe(code);
  });

  it("recognizes pnpm JSON reporters without changing raw logs", () => {
    const stdout = JSON.stringify({ err: { code: "ERR_PNPM_IGNORED_BUILDS", message: "Ignored build scripts:\nnode-pty@1.1.0" } });
    const input = result({ stdout });
    expect(classifyInstallFailure(input)?.code).toBe("ignored-builds");
    expect(input.stdout).toBe(stdout);
  });

  it("separates nested build approval from its prepare wrapper", () => {
    expect(classifyPnpmFailure(`${ignoredBuilds}\nERR_PNPM_PREPARE_PACKAGE`)?.code).toBe("ignored-builds");
    expect(classifyPnpmFailure(". prepare: Failed\nELIFECYCLE")?.code).toBe("prepare-failed");
  });

  it("does not claim a missing DSH package must be an unpublished host peer", () => {
    const failure = classifyPnpmFailure("ERR_PNPM_FETCH_404 GET https://registry.npmjs.org/@deepseek-ai%2Fdsh-tools");
    expect(failure).toMatchObject({ code: "host-peer", packageName: "@deepseek-ai/dsh-tools" });
    expect(failure?.message).not.toMatch(/未发布|已关闭/);
  });

  it("does not treat successful install warnings or curl write errors as failure", () => {
    expect(classifyInstallFailure(result({ exitCode: 0, stdout: ignoredBuilds }))).toBeNull();
    expect(classifyPnpmFailure("[WARN] Issues with peer dependencies found.")).toBeNull();
    expect(classifyPnpmFailure("curl error (23): Failed writing received data")).toBeNull();
  });

  it("keeps cancellation, total timeout, and unknown failure distinct", () => {
    expect(classifyInstallFailure(result({ cancelled: true, timedOut: true }))?.code).toBe("cancelled");
    expect(classifyInstallFailure(result({ exitCode: 0, timedOut: true }))?.code).toBe("install-timeout");
    expect(classifyInstallFailure(result({ stderr: "unknown tool error" }))?.code).toBe("install-failed");
  });
});

describe("pnpm profile compatibility", () => {
  it("adds the workspace-root flag only for profile workspaces", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dsh-top100-pnpm-"));
    writeFileSync(join(workspace, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    const ordinary = mkdtempSync(join(tmpdir(), "dsh-top100-pnpm-"));
    expect(pluginArgsFor(workspace, ["add", "demo"])).toEqual(["add", "-w", "--save-exact", "demo"]);
    expect(pluginArgsFor(ordinary, ["add", "demo"])).toEqual(["add", "--save-exact", "demo"]);
    const pinned = pluginArgsFor(workspace, ["add", "demo@2.0.0-beta.2"]);
    expect(pluginArgsFor(workspace, pinned)).toEqual(pinned);
    expect(pinned.at(-1)).toBe("demo@2.0.0-beta.2");
  });

  it.each(["The operation was aborted due to timeout", gitTimeout, "ECONNRESET"])(
    "retries transport failure once without changing user options: %s", async (stderr) => {
      const args = ["add", "--config.fetchTimeout=20000", "--config.auto-install-peers=true",
        "--config.strict-dep-builds=true", "--config.minimumReleaseAge=1440", "--ignore-scripts", "demo@1.0.0"];
      const originalArgs = [...args];
      const run = vi.fn()
        .mockResolvedValueOnce(result({ stderr }))
        .mockResolvedValueOnce(result({ exitCode: 0, stdout: "installed", stderr: "final warning" }));
      const outcome = await withPnpmRecovery(run, "web", args);
      expect(outcome.exitCode).toBe(0);
      expect(run).toHaveBeenCalledTimes(2);
      expect(run).toHaveBeenNthCalledWith(2, "web", originalArgs);
      expect(args).toEqual(originalArgs);
      expect(outcome.stderr).toContain(stderr);
      expect(outcome.stderr).toContain("final warning");
      expect(classifyInstallFailure(outcome)).toBeNull();
    },
  );

  it.each([
    ignoredBuilds, prepareFailure,
    "ERR_PNPM_PEER_DEP_ISSUES", "ERR_PNPM_FETCH_404 @deepseek-ai/dsh-tools",
    "minimumReleaseAge: release is too new", "ERR_PNPM_PUBLIC_HOIST_PATTERN_DIFF", "ELIFECYCLE",
  ])("does not bypass policy, run repairs, or retry deterministic failures: %s", async (stderr) => {
    const first = result({ stderr });
    const run = vi.fn().mockResolvedValue(first);
    const outcome = await withPnpmRecovery(run, "web", ["add", "demo@1.0.0"]);
    expect(run).toHaveBeenCalledExactlyOnceWith("web", ["add", "demo@1.0.0"]);
    expect(outcome).toBe(first);
    expect(outcome.stderr).toBe(stderr);
    expect(outcome.exitCode).toBe(1);
  });

  it("preserves both attempts but classifies the final blocker", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(result({ stdout: gitTimeout, stderr: "original stderr" }))
      .mockResolvedValueOnce(result({ stdout: ignoredBuilds, stderr: "latest stderr" }));
    const outcome = await withPnpmRecovery(run, "web", ["add", "demo@1.0.0"]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(outcome.stdout).toContain(gitTimeout);
    expect(outcome.stdout).toContain(ignoredBuilds);
    expect(outcome.stderr).toContain("original stderr");
    expect(outcome.stderr).toContain("latest stderr");
    expect(classifyInstallFailure(outcome)?.code).toBe("ignored-builds");
    expect(outcome.exitCode).toBe(1);
  });

  it("does not reuse an earlier diagnosis for an unknown retry failure", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(result({ stdout: gitTimeout }))
      .mockResolvedValueOnce(result({ stderr: "different unknown failure" }));
    expect(classifyInstallFailure(await withPnpmRecovery(run, "web", ["add", "demo@1.0.0"]))?.code)
      .toBe("install-failed");
  });

  it("never retries more than once", async () => {
    const run = vi.fn().mockResolvedValue(result({ stderr: gitTimeout }));
    const outcome = await withPnpmRecovery(run, "web", ["remove", "demo"]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(outcome.exitCode).toBe(1);
    expect(classifyInstallFailure(outcome)?.code).toBe("git-network");
  });

  it.each([
    result({ cancelled: true, stderr: gitTimeout }),
    result({ timedOut: true, stderr: gitTimeout }),
    result({ exitCode: 0, stderr: gitTimeout }),
  ])("does not repeat cancelled, timed-out, or successful operations", async (first) => {
    const run = vi.fn().mockResolvedValue(first);
    expect(await withPnpmRecovery(run, "web", ["add", "demo@1.0.0"])).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
