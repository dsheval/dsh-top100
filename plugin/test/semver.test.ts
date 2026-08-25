import { describe, expect, it } from "vitest";
import { compareSemver, parseSemver, satisfiesRange } from "../src/host/semver.js";

describe("semver diagnostics", () => {
  it("parses and orders releases", () => {
    expect(parseSemver("1.2.3")).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(compareSemver("1.2.3", "1.3.0")).toBeLessThan(0);
    expect(compareSemver("1.2.3", "1.2.3-rc.1")).toBeGreaterThan(0);
  });

  it("checks common peer dependency ranges", () => {
    expect(satisfiesRange("4.2.0", "^4.0.1")).toBe(true);
    expect(satisfiesRange("5.0.0", "^4.0.1")).toBe(false);
    expect(satisfiesRange("0.1.5", "~0.1.1")).toBe(true);
    expect(satisfiesRange("4.2.0", ">=4.0.0 <5.0.0")).toBe(true);
  });
});
