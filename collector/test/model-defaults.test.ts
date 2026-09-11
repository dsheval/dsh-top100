import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshPlugin } from "@dsh-top100/schema";
import { DEFAULT_MODEL } from "../src/model-defaults.js";
import { translateWithDeepSeek, classifyWithDeepSeek } from "../src/llm.js";
import { normalizeTags } from "../src/tag-normalize.js";

const input = { name: "fixture", description: "Research references.", readmeSummary: null, topics: [] };
const options = { requestMode: "offline-test" as const, apiKey: "offline-key", baseURL: "https://example.invalid", model: DEFAULT_MODEL };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("paused model request defaults", () => {
  it("parses complete Chinese and category fixtures with explicit non-thinking and 256-token bodies", async () => {
    vi.stubEnv("DEEPSEEK_MAX_TOKENS", undefined);
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    const fixtures = [
      { descriptionZh: "检索论文并整理文献引用，辅助用户核对研究资料。", tagsZh: ["论文检索", "文献整理"] },
      { categories: [{ id: "knowledge", confidence: 0.96, evidence: "检索论文并整理研究引用" }] },
    ];
    const transport = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fixtures.shift()) } }] })));
    expect((await translateWithDeepSeek(input, { ...options, offlineTransport: transport }))?.descriptionZh).toContain("核对研究资料");
    expect((await classifyWithDeepSeek(input, { ...options, offlineTransport: transport }))[0].id).toBe("knowledge");
    for (const [, init] of transport.mock.calls as unknown as [string, RequestInit][]) {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ model: "deepseek-v4-flash", max_tokens: 256, thinking: { type: "disabled" } });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("bounds tag normalization and does not log provider output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const secret = "provider-content-must-not-be-logged";
    const transport = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ "论文检索": "文献搜索", "无关字段": secret, "文献搜索": 123 }) } }],
    })));
    const plugins = [{ tags: ["论文检索", "文献搜索"] }] as DshPlugin[];
    const result = await normalizeTags(plugins, { ...options, offlineTransport: transport });
    expect(result.alias).toEqual({ "论文检索": "文献搜索" });
    expect(plugins[0].tags).toEqual(["文献搜索"]);
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)))
      .toMatchObject({ max_tokens: 256, thinking: { type: "disabled" } });
    expect(timeout).toHaveBeenCalledWith(45_000);
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain(secret);
  });

  it("redacts tag exceptions and retries at most once by default", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = vi.fn(async () => { throw new Error("secret-in-provider-error"); });
    const pending = normalizeTags([{ tags: ["文献搜索"] }] as DshPlugin[], { ...options, offlineTransport: transport });
    await vi.runAllTimersAsync();
    expect((await pending).alias).toEqual({});
    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-in-provider-error");
  });

  it("does not retry tag authentication failures", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = vi.fn(async () => new Response("provider-secret", { status: 401 }));
    await normalizeTags([{ tags: ["文献搜索"] }] as DshPlugin[], { ...options, offlineTransport: transport });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("does not retry malformed summary or tag output", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const kind of ["summary", "tags"]) {
      const transport = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{broken}" } }] })));
      if (kind === "summary") await translateWithDeepSeek(input, { ...options, offlineTransport: transport });
      else await normalizeTags([{ tags: ["文献搜索"] }] as DshPlugin[], { ...options, offlineTransport: transport });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
});
