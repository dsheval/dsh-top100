import { EventEmitter } from "node:events";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const gitMock = vi.hoisted(() => ({
  populateCheckout: null as null | ((directory: string) => void),
  beforeRename: null as null | ((source: string, target: string) => void),
  afterRename: null as null | ((source: string, target: string) => void),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync(source: string, target: string) {
      gitMock.beforeRename?.(source, target);
      actual.renameSync(source, target);
      gitMock.afterRename?.(source, target);
    },
  };
});

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

import { installSkill, rollbackInstalledSkill } from "../src/install/skill-install.js";

const temporaryHomes: string[] = [];

afterEach(() => {
  gitMock.populateCheckout = null;
  gitMock.beforeRename = null;
  gitMock.afterRename = null;
  delete process.env.DSH_HOME;
  for (const directory of temporaryHomes.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Skill replacement and rollback preserve local edits", () => {
  const options = { commit: "e".repeat(40), replaceExisting: true };
  function home(): string {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-skill-replace-"));
    temporaryHomes.push(directory);
    process.env.DSH_HOME = directory;
    return directory;
  }
  function skill(directory: string, name = "demo", body = "catalog copy"): string {
    mkdirSync(directory, { recursive: true });
    const text = `---\nname: ${name}\ndescription: Fixture\n---\n${body}\n`;
    writeFileSync(join(directory, "SKILL.md"), text);
    return text;
  }

  it("requires explicit replacement confirmation for a different existing copy", async () => {
    const directory = home();
    const target = join(directory, "skills", "demo");
    const original = skill(target, "demo", "local edits");
    gitMock.populateCheckout = (checkout) => { skill(checkout); };
    await expect(installSkill("acme/demo", { commit: options.commit })).rejects.toThrow("确认全局替换并备份");
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe(original);
    expect(readdirSync(directory)).toEqual(["skills"]);
  });

  it("keeps all user edits in a backup when replacement was confirmed", async () => {
    const directory = home();
    const target = join(directory, "skills", "demo");
    const original = skill(target, "demo", "local edits");
    writeFileSync(join(target, "notes.txt"), "user-added file");
    mkdirSync(join(target, ".git"));
    writeFileSync(join(target, ".git", "config"), "local git settings");
    gitMock.populateCheckout = (checkout) => { skill(checkout); };
    const [installed] = await installSkill("acme/demo", options);
    expect(installed).toMatchObject({ name: "demo", alreadyInstalled: false, backupPath: expect.any(String) });
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toContain("catalog copy");
    expect(readdirSync(target)).toEqual(["SKILL.md"]);
    expect(readFileSync(join(installed!.backupPath!, "SKILL.md"), "utf8")).toBe(original);
    expect(readFileSync(join(installed!.backupPath!, "notes.txt"), "utf8")).toBe("user-added file");
    expect(readFileSync(join(installed!.backupPath!, ".git", "config"), "utf8")).toBe("local git settings");
    rollbackInstalledSkill(installed!);
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe(original);
    expect(readFileSync(join(target, "notes.txt"), "utf8")).toBe("user-added file");
  });

  it("restores the original if activating the staged replacement fails", async () => {
    const directory = home();
    const target = join(directory, "skills", "demo");
    const original = skill(target, "demo", "local edits");
    gitMock.populateCheckout = (checkout) => { skill(checkout); };
    gitMock.beforeRename = (source, destination) => {
      if (basename(source).startsWith(".demo-") && destination === target) throw new Error("simulated activation failure");
    };
    await expect(installSkill("acme/demo", options)).rejects.toThrow("activation failure");
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe(original);
    expect(readdirSync(join(directory, "skills"))).toEqual(["demo"]);
    expect(readdirSync(join(directory, "skill-backups"))).toEqual([]);
  });

  it("rolls back new and replaced Skills while leaving identical existing copies intact", async () => {
    const directory = home();
    const targetRoot = join(directory, "skills");
    const identical = skill(join(targetRoot, "b-identical"), "b-identical");
    const identity = lstatSync(join(targetRoot, "b-identical")).ino;
    const original = skill(join(targetRoot, "c-replaced"), "c-replaced", "local edits");
    writeFileSync(join(targetRoot, "c-replaced", "notes.txt"), "keep");
    gitMock.populateCheckout = (checkout) => {
      for (const name of ["a-new", "b-identical", "c-replaced"]) skill(join(checkout, "skills", name), name);
      mkdirSync(join(checkout, "skills", "d-invalid"));
      writeFileSync(join(checkout, "skills", "d-invalid", "SKILL.md"), "invalid");
    };
    await expect(installSkill("acme/collection", options)).rejects.toThrow("缺少 name 或 description");
    expect(readdirSync(targetRoot)).toEqual(["b-identical", "c-replaced"]);
    expect(readFileSync(join(targetRoot, "b-identical", "SKILL.md"), "utf8")).toBe(identical);
    expect(lstatSync(join(targetRoot, "b-identical")).ino).toBe(identity);
    expect(readFileSync(join(targetRoot, "c-replaced", "SKILL.md"), "utf8")).toBe(original);
    expect(readFileSync(join(targetRoot, "c-replaced", "notes.txt"), "utf8")).toBe("keep");
    expect(readdirSync(join(directory, "skill-backups"))).toEqual([]);
  });

  it("restores an earlier replacement if cancellation interrupts a multi-Skill transaction", async () => {
    const directory = home();
    const target = join(directory, "skills", "first");
    const original = skill(target, "first", "local edits");
    const controller = new AbortController();
    gitMock.populateCheckout = (checkout) => {
      skill(join(checkout, "skills", "first"), "first");
      skill(join(checkout, "skills", "second"), "second");
    };
    gitMock.afterRename = (source, destination) => {
      if (basename(source).startsWith(".first-") && destination === target) controller.abort();
    };
    await expect(installSkill("acme/collection", { ...options, signal: controller.signal })).rejects.toThrow();
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe(original);
    expect(readdirSync(join(directory, "skills"))).toEqual(["first"]);
  });

  it("retains newer user changes and the original backup instead of deleting them during rollback", async () => {
    const directory = home();
    const target = join(directory, "skills", "demo");
    const original = skill(target, "demo", "old local edits");
    gitMock.populateCheckout = (checkout) => { skill(checkout); };
    const [installed] = await installSkill("acme/demo", options);
    writeFileSync(join(target, "SKILL.md"), "newer user edits");
    expect(() => rollbackInstalledSkill(installed!)).toThrow("停止自动回滚");
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toBe("newer user edits");
    expect(readFileSync(join(installed!.backupPath!, "SKILL.md"), "utf8")).toBe(original);
  });

  it("does not remove a different transaction's identical-content directory", async () => {
    const directory = home();
    const target = join(directory, "skills", "demo");
    gitMock.populateCheckout = (checkout) => { skill(checkout); };
    const [installed] = await installSkill("acme/demo", options);
    renameSync(target, join(directory, "previous-transaction"));
    skill(target);
    expect(() => rollbackInstalledSkill(installed!)).toThrow("停止自动回滚");
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toContain("catalog copy");
  });
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

describe("Skill host format compatibility", () => {
  it.each([
    ["invalid YAML", "---\nname: [demo\ndescription: Demo\n---\n"],
    ["invalid skill name", "---\nname: BAD Name\ndescription: Demo\n---\n"],
    ["non-string description", "---\nname: demo\ndescription: 123\n---\n"],
    ["empty description", "---\nname: demo\ndescription: ''\n---\n"],
    ["non-mapping frontmatter", "---\n- name: demo\n- description: Demo\n---\n"],
    ["invalid opening delimiter", "--- \nname: demo\ndescription: Demo\n---\n"],
    ["invalid closing delimiter", "---\nname: demo\ndescription: Demo\n---extra\n"],
    ["legacy invocation field", "---\nname: demo\ndescription: Demo\nmodelInvocable: true\n---\n"],
    ["invalid invocation field", "---\nname: demo\ndescription: Demo\nuser-invocable: sometimes\n---\n"],
  ])("rejects %s without leaving installed files", async (_label, text) => {
    const home = mkdtempSync(join(tmpdir(), "dsh-top100-skill-format-"));
    temporaryHomes.push(home);
    process.env.DSH_HOME = home;
    gitMock.populateCheckout = (checkout) => writeFileSync(join(checkout, "SKILL.md"), text);

    await expect(installSkill("acme/demo", { commit: "c".repeat(40) })).rejects.toThrow("SKILL.md");
    expect(readdirSync(join(home, "skills"))).toEqual([]);
  });

  it.each([
    "---\nname: 'demo'\ndescription: >\n  A folded\n  description.\n---\n# Demo\n",
    "---\r\nname: demo\r\ndescription: Demo\r\nuser-invocable: 'yes'\r\ndisable-model-invocation: 0\r\n---",
  ])("installs host-supported quoted, multiline, and CRLF frontmatter", async (text) => {
    const home = mkdtempSync(join(tmpdir(), "dsh-top100-skill-format-"));
    temporaryHomes.push(home);
    process.env.DSH_HOME = home;
    gitMock.populateCheckout = (checkout) => writeFileSync(join(checkout, "SKILL.md"), text);

    await expect(installSkill("acme/demo", { commit: "d".repeat(40) })).resolves.toMatchObject([{ name: "demo", alreadyInstalled: false }]);
    expect(readFileSync(join(home, "skills", "demo", "SKILL.md"), "utf8")).toBe(text);
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
