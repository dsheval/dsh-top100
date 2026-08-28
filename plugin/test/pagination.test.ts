import { describe, expect, it } from "vitest";
import { shouldRestartPagination } from "../src/client/pagination.js";

describe("ranking pagination snapshots", () => {
  it("restarts when load-more receives a different published snapshot", () => {
    expect(shouldRestartPagination(true, "snapshot-a", "snapshot-b")).toBe(true);
    expect(shouldRestartPagination(true, "snapshot-a", "snapshot-a")).toBe(false);
    expect(shouldRestartPagination(false, "snapshot-a", "snapshot-b")).toBe(false);
  });
});
