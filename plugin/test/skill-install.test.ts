import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const gitMock = vi.hoisted(() => ({
  populateCheckout: null as null | ((directory: string) => void),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn((_: string, args: string[], options: { cwd?: string }) => {
    const child = new EventEmitter() as EventEmitter & { stderr: PassThrough };
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      if (args[0] === "checkout" && options.cwd) gitMock.populateCheckout?.(options.cwd);
      child.emit("close", 0);
    });
    return child;
  }),
}));

import { installSkill } from "../src/install/skill-install.js";

const temporaryHomes: string[] = [];

afterEach(() => {
  gitMock.populateCheckout = null;
  delete process.env.DSH_HOME;
  for (const directory of temporaryHomes.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("transactional Skill installation", () => {
  it("removes earlier copies when a later Skill in the same repository is invalid", async () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-top100-skill-home-"));
    temporaryHomes.push(home);
    process.env.DSH_HOME = home;
    gitMock.populateCheckout = (checkout) => {
      const first = join(checkout, "skills", "first");
      const second = join(checkout, "skills", "second");
      mkdirSync(first, { recursive: true });
      mkdirSync(second, { recursive: true });
      writeFileSync(join(first, "SKILL.md"), "---\nname: first\ndescription: Valid first Skill\n---\n");
      writeFileSync(join(second, "SKILL.md"), "# Missing frontmatter\n");
    };

    await expect(installSkill("acme/skills", {
      commit: "a".repeat(40),
    })).rejects.toThrow("缺少 name 或 description");
    expect(readdirSync(join(home, "skills"))).toEqual([]);
  });
});
