import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshPlugin } from "@dsh-top100/schema";
import { canRequestModel, modelRequestsEnabled, requestModel } from "../src/model-requests.js";
import { classifyWithDeepSeek, translateWithDeepSeek } from "../src/llm.js";
import { normalizeTags } from "../src/tag-normalize.js";
const input = { name: "test", description: "Search academic papers.", readmeSummary: null, topics: [] };
const options = { apiKey: "residual-test-key", baseURL: "https://example.invalid", model: "test" };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("fail-closed shared model gate", () => {
  it.each([undefined, "0", "false", "true", "1"])("blocks all paid transports with switch %s, even with a key", async value => {
    vi.stubEnv("DSH_MODEL_REQUESTS_ENABLED", value);
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    const plugins = [{ tags: ["效率工具", "论文检索"] }] as DshPlugin[];
    expect(modelRequestsEnabled()).toBe(false);
    expect(await translateWithDeepSeek(input, options)).toBeNull();
    expect(await classifyWithDeepSeek(input, options)).toEqual([]);
    expect(await normalizeTags(plugins, options)).toEqual({ alias: {}, removedGeneric: 0, mergedCount: 0 });
    expect(plugins[0].tags).toEqual(["效率工具", "论文检索"]);
    await expect(requestModel({}, options.baseURL, {})).rejects.toThrow("paused");
    expect(network).not.toHaveBeenCalled();
  });
  it("requires both explicit test mode and injected transport, and refuses injection in production", async () => {
    const transport = vi.fn(async () => new Response("{}"));
    expect(canRequestModel({ offlineTransport: transport })).toBe(false);
    expect(canRequestModel({ requestMode: "offline-test" })).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(canRequestModel({ requestMode: "offline-test", offlineTransport: transport })).toBe(false);
    await expect(requestModel({ requestMode: "offline-test", offlineTransport: transport }, options.baseURL, {})).rejects.toThrow("paused");
    expect(transport).not.toHaveBeenCalled();
  });
  it("allows tag parsing only through an explicitly injected offline test response", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const transport = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"论文检索":"文献搜索"}' } }] })));
    const plugins = [{ tags: ["论文检索", "文献搜索"] }] as DshPlugin[];
    expect((await normalizeTags(plugins, { ...options, requestMode: "offline-test", offlineTransport: transport })).alias).toEqual({ "论文检索": "文献搜索" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(network).not.toHaveBeenCalled();
  });
});
