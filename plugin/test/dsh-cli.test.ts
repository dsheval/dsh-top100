import { describe, expect, it } from "vitest";
import { proxyEnvForPnpm, safeExecArgv, toolSearchDirs } from "../src/install/dsh-cli.js";

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
});
