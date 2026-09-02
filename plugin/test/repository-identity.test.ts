import { describe, expect, it } from "vitest";
import { presentRepositoryIdentity } from "../src/client/repository-identity.js";

describe("repository identity presentation", () => {
  it("keeps a human-readable project name and separates the GitHub owner", () => {
    expect(presentRepositoryIdentity({
      fullName: "chokwinlee/deepseek-harness-desktop",
      name: "DeepSeek Harness Desktop",
      owner: "chokwinlee",
    })).toEqual({ name: "DeepSeek Harness Desktop", owner: "chokwinlee" });
  });

  it("removes a duplicated owner when compact data repeats the full repository path as the name", () => {
    expect(presentRepositoryIdentity({
      fullName: "dream-num/dsh-univer-office",
      name: "dream-num/dsh-univer-office",
      owner: "dream-num",
    })).toEqual({ name: "dsh-univer-office", owner: "dream-num" });
  });

  it("falls back to the authoritative repository path when optional display fields are blank", () => {
    expect(presentRepositoryIdentity({
      fullName: "acme/dsh-demo",
      name: "",
      owner: "",
    })).toEqual({ name: "dsh-demo", owner: "acme" });
  });
});
