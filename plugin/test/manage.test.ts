import { describe, expect, it } from "vitest";
import { resolveUpdateTarget } from "../src/host/manage.js";

describe("managed plugin updates", () => {
  it("resolves npm and GitHub update targets", () => {
    expect(resolveUpdateTarget("sample-plugin", "^1.0.0")).toBe("sample-plugin@latest");
    expect(resolveUpdateTarget("sample-plugin", "github:owner/repo#main")).toBe("github:owner/repo");
  });

  it("does not overwrite local source links", () => {
    expect(resolveUpdateTarget("sample-plugin", "link:/tmp/sample")).toBeNull();
    expect(resolveUpdateTarget("sample-plugin", "file:../sample")).toBeNull();
  });
});
