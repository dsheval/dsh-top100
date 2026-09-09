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

  it("orders prerelease identifiers numerically and before text identifiers", () => {
    expect(compareSemver("1.0.0-rc.9", "1.0.0-rc.10")).toBeLessThan(0);
    expect(compareSemver("1.0.0-beta.2", "1.0.0-beta.11")).toBeLessThan(0);
    expect(compareSemver("1.0.0-beta.11", "1.0.0-rc.1")).toBeLessThan(0);
    expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
    expect(compareSemver("1.0.0-beta", "1.0.0-beta.1")).toBeLessThan(0);
    expect(compareSemver("1.0.0+build1", "1.0.0+build2")).toBe(0);
  });

  it.each(["01.0.0", "1.0.0-rc..1", "1.0.0-rc.01", "1.0.0+", "1.0.0+build..1"])("rejects malformed version %s", (version) => {
    expect(parseSemver(version)).toBeNull();
  });
});
