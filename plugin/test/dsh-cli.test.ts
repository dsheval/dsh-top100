import { describe, expect, it } from "vitest";
import { safeExecArgv } from "../src/install/dsh-cli.js";

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
