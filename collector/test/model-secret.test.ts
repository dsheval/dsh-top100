import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { applyModelApiKey, loadModelApiKey, ModelSecretError } from "../src/model-secret.js";

vi.mock("node:fs", () => ({
  constants: { O_RDONLY: 0, O_NOFOLLOW: 0x100, O_NONBLOCK: 0x800 },
  closeSync: vi.fn(), fstatSync: vi.fn(), lstatSync: vi.fn(), openSync: vi.fn(),
  readFileSync: vi.fn(), realpathSync: vi.fn(), existsSync: vi.fn(),
}));

const repo = "/fixture/repo";
const file = "/private/secrets/deepseek-key";
const key = "fixture-only-never-a-real-key";
const stat = () => ({ isFile: () => true, isSymbolicLink: () => false, mode: 0o100600,
  uid: process.geteuid?.(), nlink: 1, size: 40, dev: 1, ino: 7 }) as fs.Stats;
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fs.realpathSync).mockImplementation((p) => String(p));
  vi.mocked(fs.lstatSync).mockReturnValue(stat());
  vi.mocked(fs.fstatSync).mockReturnValue(stat());
  vi.mocked(fs.openSync).mockReturnValue(9);
  vi.mocked(fs.readFileSync).mockReturnValue(`${key}\n`);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("model secret file", () => {
  it("loads a private external file through an O_NOFOLLOW descriptor, without logging", () => {
    const log = vi.spyOn(console, "log"); const warn = vi.spyOn(console, "warn");
    expect(loadModelApiKey({ DEEPSEEK_API_KEY_FILE: file }, repo)).toBe(key);
    expect(fs.openSync).toHaveBeenCalledWith(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    expect(fs.readFileSync).toHaveBeenCalledWith(9, "utf8");
    expect(fs.closeSync).toHaveBeenCalledWith(9);
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });

  it("supports an environment key without touching the filesystem", () => {
    const env = { DEEPSEEK_API_KEY: ` ${key} `, DEEPSEEK_API_KEY_FILE: "" };
    applyModelApiKey(env, repo); expect(env.DEEPSEEK_API_KEY).toBe(key);
    expect(fs.realpathSync).not.toHaveBeenCalled(); expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(loadModelApiKey({}, repo)).toBeUndefined();
  });

  it("gives the configured file precedence over an old environment key", () => {
    const env = { DEEPSEEK_API_KEY: "stale-key", DEEPSEEK_API_KEY_FILE: file };
    applyModelApiKey(env, repo); expect(env.DEEPSEEK_API_KEY).toBe(key);
  });

  it.each(["relative.key", "/fixture/repo/secret", "/fixture/repo/sub/secret"])("rejects unsafe path %s before reading", (path) => {
    expect(() => loadModelApiKey({ DEEPSEEK_API_KEY_FILE: path }, repo)).toThrow(ModelSecretError);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("rejects an external alias resolving inside the repository", () => {
    vi.mocked(fs.realpathSync).mockImplementation((p) => String(p) === file ? `${repo}/secret` : String(p));
    expect(() => loadModelApiKey({ DEEPSEEK_API_KEY_FILE: file }, repo)).toThrow(ModelSecretError);
    expect(fs.openSync).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 0o100644 }, { mode: 0o100640 }, { mode: 0o100400 }, { mode: 0o104600 },
    { uid: (process.geteuid?.() ?? 0) + 1 }, { nlink: 2 }, { size: 0 }, { size: 16_385 },
    { isFile: () => false }, { isSymbolicLink: () => true },
  ])("rejects unsafe file metadata %j without reading", (override) => {
    vi.mocked(fs.lstatSync).mockReturnValue({ ...stat(), ...override } as fs.Stats);
    expect(() => loadModelApiKey({ DEEPSEEK_API_KEY_FILE: file }, repo)).toThrow(ModelSecretError);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it("rejects a replaced inode and closes the descriptor", () => {
    vi.mocked(fs.fstatSync).mockReturnValue({ ...stat(), ino: 8 } as fs.Stats);
    expect(() => loadModelApiKey({ DEEPSEEK_API_KEY_FILE: file }, repo)).toThrow(ModelSecretError);
    expect(fs.readFileSync).not.toHaveBeenCalled(); expect(fs.closeSync).toHaveBeenCalledWith(9);
  });

  it("rechecks permissions on the opened descriptor before reading", () => {
    vi.mocked(fs.fstatSync).mockReturnValue({ ...stat(), mode: 0o100644 } as fs.Stats);
    expect(() => loadModelApiKey({ DEEPSEEK_API_KEY_FILE: file }, repo)).toThrow(ModelSecretError);
    expect(fs.readFileSync).not.toHaveBeenCalled(); expect(fs.closeSync).toHaveBeenCalledWith(9);
  });

  it.each([" \n", "fixture\nsecond-key"])("rejects empty or multiline contents", (contents) => {
    vi.mocked(fs.readFileSync).mockReturnValue(contents);
    expect(() => loadModelApiKey({ DEEPSEEK_API_KEY_FILE: file }, repo)).toThrow(ModelSecretError);
    expect(fs.closeSync).toHaveBeenCalledWith(9);
  });

  it.each(["realpathSync", "lstatSync", "openSync", "fstatSync", "readFileSync"] as const)("fails closed and redacts %s errors", (operation) => {
    vi.mocked(fs[operation]).mockImplementation(() => { throw new Error(`${file}: ${key}`); });
    const env = { DEEPSEEK_API_KEY: "stale-secret", DEEPSEEK_API_KEY_FILE: file };
    let caught: unknown;
    try { applyModelApiKey(env, repo); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ModelSecretError);
    expect(String(caught)).not.toContain(key); expect(String(caught)).not.toContain(file);
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
  });

  it("env entrypoint applies the file after dotenv without accessing real files", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY_FILE", file); vi.stubEnv("DEEPSEEK_API_KEY", "stale-secret");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await import("../src/env.js");
    expect(process.env.DEEPSEEK_API_KEY).toBe(key);
    expect(fs.readFileSync).toHaveBeenCalledOnce();
  });

  it("env entrypoint rejects a failed file load and removes the old key", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY_FILE", file); vi.stubEnv("DEEPSEEK_API_KEY", "stale-secret");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error("private failure"); });
    await expect(import("../src/env.js")).rejects.toThrow("could not be securely loaded");
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
  });
});
