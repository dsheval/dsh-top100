import { describe, expect, it } from "vitest";
import { sameOrigin } from "../src/host/http.js";

describe("sameOrigin", () => {
  it("accepts a matching Origin and Host", () => {
    expect(
      sameOrigin({
        headers: { origin: "http://127.0.0.1:3080", host: "127.0.0.1:3080" },
      } as never),
    ).toBe(true);
  });

  it("rejects a missing or cross-origin request", () => {
    expect(sameOrigin({ headers: { host: "127.0.0.1:3080" } } as never)).toBe(false);
    expect(
      sameOrigin({
        headers: { origin: "https://evil.example", host: "127.0.0.1:3080" },
      } as never),
    ).toBe(false);
  });
});
