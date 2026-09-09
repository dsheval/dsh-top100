import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

import { backupSkill, inspectSkill, restoreSkillBackup, withSkillMutationLock } from "../src/host/skill-management.js";

const homes: string[] = [];

function home(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-skill-management-"));
  homes.push(directory);
  vi.stubEnv("DSH_HOME", directory);
  return directory;
}

function skill(directory: string, name = "demo"): string {
  const target = join(directory, "skills", name);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), `---\nname: ${name}\ndescription: Fixture\n---\n`);
  return target;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  for (const directory of homes.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("global Skill inspection", () => {
  it("reports a missing Skill without creating directories", () => {
    const directory = home();
    expect(inspectSkill("demo")).toMatchObject({ scope: "global", installed: false, modificationState: "unknown", files: [] });
    expect(readdirSync(directory)).toEqual([]);
  });

  it("requires digest evidence to claim that local content is unchanged", () => {
    const directory = home();
    const target = skill(directory);
    const original = inspectSkill("demo");
    expect(original).toMatchObject({ scope: "global", installed: true, files: ["SKILL.md"], modificationState: "unknown" });
    expect(inspectSkill("demo", { files: original.files }).modificationState).toBe("unknown");
    expect(inspectSkill("demo", { digest: "invalid" }).modificationState).toBe("unknown");
    expect(inspectSkill("demo", { digest: original.digest! }).modificationState).toBe("unchanged");
    writeFileSync(join(target, "SKILL.md"), "My local edits\n");
    expect(inspectSkill("demo", { digest: original.digest! }).modificationState).toBe("modified");
  });

  it("detects extra files, deleted files, and newly added git metadata", () => {
    const directory = home();
    const target = skill(directory);
    const original = inspectSkill("demo");
    writeFileSync(join(target, "notes.txt"), "user notes");
    expect(inspectSkill("demo", { digest: original.digest! }).modificationState).toBe("modified");
    rmSync(join(target, "notes.txt"));
    mkdirSync(join(target, ".git"));
    writeFileSync(join(target, ".git", "config"), "local configuration");
    expect(inspectSkill("demo", { digest: original.digest! }).modificationState).toBe("modified");
    rmSync(join(target, ".git"), { recursive: true });
    rmSync(join(target, "SKILL.md"));
    expect(inspectSkill("demo", { digest: original.digest! }).modificationState).toBe("modified");
  });
});

describe("recoverable global Skill removal", () => {
  it("moves all local files into a unique backup and can restore them", () => {
    const directory = home();
    const target = skill(directory);
    mkdirSync(join(target, "user-data"));
    writeFileSync(join(target, "user-data", "image.bin"), Buffer.from([0, 1, 2, 255]));
    writeFileSync(join(target, ".notes"), "private local edits");
    const original = inspectSkill("demo");
    const first = backupSkill("demo");
    expect(first).toMatchObject({ name: "demo", scope: "global" });
    expect(first.backupPath.startsWith(join(directory, "skill-backups") + "/")).toBe(true);
    expect(inspectSkill("demo").installed).toBe(false);
    expect(readFileSync(join(first.backupPath, "user-data", "image.bin"))).toEqual(Buffer.from([0, 1, 2, 255]));
    expect(readFileSync(join(first.backupPath, ".notes"), "utf8")).toBe("private local edits");
    restoreSkillBackup(first);
    expect(inspectSkill("demo", { digest: original.digest! }).modificationState).toBe("unchanged");
    const second = backupSkill("demo");
    expect(second.backupPath).not.toBe(first.backupPath);
  });

  it.each(["../outside", "/tmp/demo", "", "Demo", "demo/child"])("rejects invalid target %s", (name) => {
    const directory = home();
    skill(directory);
    expect(() => backupSkill(name)).toThrow("目录名无效");
    expect(inspectSkill("demo").installed).toBe(true);
  });

  it.each(["target", "child", "backups", "skills", "home"])("rejects linked %s without touching the destination", (kind) => {
    const directory = home();
    const target = skill(directory);
    const external = join(directory, "outside");
    mkdirSync(external);
    writeFileSync(join(external, "keep.txt"), "keep");
    if (kind === "target") {
      rmSync(target, { recursive: true });
      symlinkSync(external, target);
    } else if (kind === "child") symlinkSync(external, join(target, "linked"));
    else if (kind === "backups") symlinkSync(external, join(directory, "skill-backups"));
    else if (kind === "skills") {
      rmSync(join(directory, "skills"), { recursive: true });
      symlinkSync(external, join(directory, "skills"));
    } else {
      const link = join(directory, "linked-home");
      symlinkSync(directory, link);
      vi.stubEnv("DSH_HOME", link);
    }
    expect(() => backupSkill("demo")).toThrow("符号链接");
    expect(readFileSync(join(external, "keep.txt"), "utf8")).toBe("keep");
    expect(readdirSync(external)).toEqual(["keep.txt"]);
  });

  it("preserves the original when atomic backup rename fails", () => {
    const directory = home();
    const target = skill(directory);
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error("simulated cross-device failure"); });
    expect(() => backupSkill("demo")).toThrow("cross-device failure");
    expect(readFileSync(join(target, "SKILL.md"), "utf8")).toContain("name: demo");
    expect(readdirSync(join(directory, "skill-backups"))).toEqual([]);
  });

  it("preserves the original when the backup root cannot be a directory", () => {
    const directory = home();
    const target = skill(directory);
    writeFileSync(join(directory, "skill-backups"), "existing unrelated file");
    expect(() => backupSkill("demo")).toThrow("不是目录");
    expect(lstatSync(target).isDirectory()).toBe(true);
    expect(readFileSync(join(directory, "skill-backups"), "utf8")).toBe("existing unrelated file");
  });

  it("refuses restore over a newly created copy and retains both copies", () => {
    const directory = home();
    skill(directory);
    const backup = backupSkill("demo");
    const replacement = skill(directory);
    writeFileSync(join(replacement, "SKILL.md"), "newly created by user");
    expect(() => restoreSkillBackup(backup)).toThrow("恢复目标已存在");
    expect(readFileSync(join(replacement, "SKILL.md"), "utf8")).toBe("newly created by user");
    expect(readFileSync(join(backup.backupPath, "SKILL.md"), "utf8")).toContain("name: demo");
  });

  it("rejects a forged backup path", () => {
    const directory = home();
    const outside = join(directory, "unrelated");
    mkdirSync(outside);
    expect(() => restoreSkillBackup({ name: "demo", scope: "global", backupPath: outside })).toThrow("路径无效");
    expect(lstatSync(outside).isDirectory()).toBe(true);
  });
});

describe("global Skill transaction lock", () => {
  it("serializes mutation and ledger persistence and releases after failures", async () => {
    const events: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const first = withSkillMutationLock(async () => {
      events.push("first install");
      await pending;
      events.push("first ledger");
      throw new Error("ledger failure");
    });
    const firstResult = expect(first).rejects.toThrow("ledger failure");
    const second = withSkillMutationLock(() => { events.push("second install"); });
    await Promise.resolve();
    expect(events).toEqual(["first install"]);
    release();
    await firstResult;
    await second;
    expect(events).toEqual(["first install", "first ledger", "second install"]);
  });

  it("does not mutate when a queued operation was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const mutate = vi.fn();
    await expect(withSkillMutationLock(mutate, controller.signal)).rejects.toThrow();
    expect(mutate).not.toHaveBeenCalled();
    await expect(withSkillMutationLock(() => "next")).resolves.toBe("next");
  });
});
