import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allowPackageBuild } from "../src/install/allow-builds.js";

const previousHome = process.env.DSH_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
});

describe("allowPackageBuild", () => {
  it("appends one exact package to allowBuilds", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-top100-allow-"));
    const profile = join(home, "profiles", "web");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "pnpm-workspace.yaml"), "packages:\n  - .\n");
    process.env.DSH_HOME = home;
    expect(allowPackageBuild("web", "@acme/demo")).toBe(true);
    expect(allowPackageBuild("web", "@acme/demo")).toBe(false);
    expect(readFileSync(join(profile, "pnpm-workspace.yaml"), "utf8")).toContain('"@acme/demo": true');
  });
});
