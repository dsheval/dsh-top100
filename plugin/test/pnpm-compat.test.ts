import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  FETCH_TIMEOUT_OVERRIDE,
  pluginArgsFor,
  withPnpmRecovery,
} from "../src/install/pnpm-compat.js";
import type { InstallResult } from "../src/shared/types.js";

function result(overrides: Partial<InstallResult>): InstallResult {
  return { exitCode: 1, timedOut: false, stdout: "", stderr: "", cancelled: false, ...overrides };
}

describe("pnpm profile compatibility", () => {
  it("adds the workspace-root flag only for profile workspaces", () => {
    const workspace = mkdtempSync(join(tmpdir(), "dsh-top100-pnpm-"));
    writeFileSync(join(workspace, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    const ordinary = mkdtempSync(join(tmpdir(), "dsh-top100-pnpm-"));
    expect(pluginArgsFor(workspace, ["add", "demo"])).toEqual(["add", "-w", "demo"]);
    expect(pluginArgsFor(ordinary, ["add", "demo"])).toEqual(["add", "demo"]);
  });

  it("retries a fetch timeout once with a longer per-request timeout", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-pnpm-"));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), "{\"dependencies\":{}}\n");
    const run = vi.fn()
      .mockResolvedValueOnce(result({ stderr: "The operation was aborted due to timeout" }))
      .mockResolvedValueOnce(result({ exitCode: 0 }));

    await expect(withPnpmRecovery(run, "web", ["add", "demo"], directory))
      .resolves.toMatchObject({ exitCode: 0 });
    expect(run).toHaveBeenNthCalledWith(2, "web", ["add", FETCH_TIMEOUT_OVERRIDE, "demo"]);
  });
});
