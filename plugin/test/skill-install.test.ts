import { EventEmitter } from "node:events";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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


describe("Skill filesystem boundaries", () => {
  function home(): string {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-skill-boundary-"));
    temporaryHomes.push(directory);
    process.env.DSH_HOME = join(directory, "home");
    return directory;
  }
  function skill(directory: string, name = "demo"): void {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: Fixture Skill\n---\n`);
  }
  const options = { commit: "b".repeat(40) };

  it.each(["skills", "skill"])("rejects a linked %s parent before copying external content", async (folder) => {
    const directory = home();
    const external = join(directory, "external");
    skill(join(external, "outside"), "outside");
    gitMock.populateCheckout = (checkout) => symlinkSync(external, join(checkout, folder));
    await expect(installSkill("acme/demo", options)).rejects.toThrow("符号链接");
    expect(readdirSync(join(process.env.DSH_HOME!, "skills"))).toEqual([]);
    expect(readFileSync(join(external, "outside", "SKILL.md"), "utf8")).toContain("name: outside");
  });

  it("rejects a linked source parent even when it resolves inside the checkout", async () => {
    home();
    gitMock.populateCheckout = (checkout) => {
      skill(join(checkout, "real-skills", "demo"));
      symlinkSync("real-skills", join(checkout, "skills"));
    };
    await expect(installSkill("acme/demo", options)).rejects.toThrow("符号链接");
    expect(readdirSync(join(process.env.DSH_HOME!, "skills"))).toEqual([]);
  });

  it("rejects a linked child Skill instead of silently installing only its siblings", async () => {
    const directory = home();
    const external = join(directory, "external");
    skill(external, "outside");
    gitMock.populateCheckout = (checkout) => {
      skill(join(checkout, "skills", "demo"));
      symlinkSync(external, join(checkout, "skills", "outside"));
    };
    await expect(installSkill("acme/demo", options)).rejects.toThrow("符号链接");
    expect(readdirSync(join(process.env.DSH_HOME!, "skills"))).toEqual([]);
  });

  it("rejects a linked root manifest", async () => {
    const directory = home();
    skill(join(directory, "external"));
    gitMock.populateCheckout = (checkout) => symlinkSync(join(directory, "external", "SKILL.md"), join(checkout, "SKILL.md"));
    await expect(installSkill("acme/demo", options)).rejects.toThrow("符号链接");
    expect(readdirSync(join(process.env.DSH_HOME!, "skills"))).toEqual([]);
  });

  it.each([false, true])("rejects an existing linked install target (dangling=%s)", async (dangling) => {
    const directory = home();
    const external = join(directory, "external");
    if (!dangling) skill(external);
    const targetRoot = join(process.env.DSH_HOME!, "skills");
    mkdirSync(targetRoot, { recursive: true });
    symlinkSync(external, join(targetRoot, "demo"));
    gitMock.populateCheckout = (checkout) => skill(checkout);
    await expect(installSkill("acme/demo", options)).rejects.toThrow("安装目标是符号链接");
    expect(lstatSync(join(targetRoot, "demo")).isSymbolicLink()).toBe(true);
    if (!dangling) expect(readFileSync(join(external, "SKILL.md"), "utf8")).toContain("name: demo");
  });

  it("rejects a linked target root without writing to its destination", async () => {
    const directory = home();
    const external = join(directory, "external");
    mkdirSync(external);
    mkdirSync(process.env.DSH_HOME!);
    symlinkSync(external, join(process.env.DSH_HOME!, "skills"));
    gitMock.populateCheckout = (checkout) => skill(checkout);
    await expect(installSkill("acme/demo", options)).rejects.toThrow("安装目录是符号链接");
    expect(readdirSync(external)).toEqual([]);
  });

  it.each(["root", "nested"])("installs normal %s Skills and recognizes an identical existing copy", async (layout) => {
    home();
    gitMock.populateCheckout = (checkout) => skill(layout === "root" ? checkout : join(checkout, "skills", "demo"));
    await expect(installSkill("acme/demo", options)).resolves.toMatchObject([{ name: "demo", alreadyInstalled: false, commit: options.commit }]);
    await expect(installSkill("acme/demo", options)).resolves.toMatchObject([{ name: "demo", alreadyInstalled: true, commit: options.commit }]);
  });
});
