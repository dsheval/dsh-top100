import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyWithDeepSeek, translateWithDeepSeek } from "../src/llm.js";
const input = { name: "sample", description: "Search research papers with references.", readmeSummary: null, topics: [] };
const options = { requestMode: "offline-test" as const, offlineTransport: (...args: Parameters<typeof fetch>) => fetch(...args), apiKey: "test-key", baseURL: "https://example.test", model: "test", retryDelayMs: 0 };
afterEach(() => vi.restoreAllMocks());
describe("bounded classification requests", () => {
  it("uses selected package identity and returns a single primary category", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ categories: [
      { id: "tools", confidence: 0.95, evidence: "余额和费用统计" },
      { id: "appearance", confidence: 0.8, evidence: "界面面板" },
    ] }) } }] })));
    const result = await classifyWithDeepSeek({ ...input, packageName: "@test/usage", repositoryPath: "packages/usage" }, { ...options, thinking: "disabled" });
    expect(result.map(item => item.id)).toEqual(["tools"]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[1].content).toContain("@test/usage");
    expect(body.messages[1].content).toContain("packages/usage");
    expect(body.messages[1].content).not.toContain(input.description);
    expect(body.messages[1].content).toContain("不添加辅助分类");
  });
  it("honors single-attempt mode for durable batch queues", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await classifyWithDeepSeek(input, { ...options, maxAttempts: 1 })).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("keeps the default three attempts and supplies a bounded AbortSignal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await classifyWithDeepSeek(input, options)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(timeout).toHaveBeenCalledWith(45_000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("returns a retryable empty result when the request timeout aborts fetch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, request) => new Promise((_resolve, reject) => {
      request!.signal!.addEventListener("abort", () => reject(request!.signal!.reason), { once: true });
    }));
    const request = classifyWithDeepSeek(input, { ...options, timeoutMs: 1000, maxAttempts: 1 });
    controller.abort(new DOMException("timeout", "TimeoutError"));
    expect(await request).toEqual([]);
    expect(timeout).toHaveBeenCalledWith(1000);
  });
  it("rejects invalid attempt and timeout settings before network access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected request"));
    await expect(classifyWithDeepSeek(input, { ...options, maxAttempts: 0 })).rejects.toThrow("maxAttempts");
    await expect(classifyWithDeepSeek(input, { ...options, timeoutMs: 0 })).rejects.toThrow("timeoutMs");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never logs provider bodies, model content, repository names or arbitrary exception messages", async () => {
    const secret = "credential-echo-must-stay-private";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (const call of [translateWithDeepSeek, classifyWithDeepSeek]) {
      fetchMock.mockResolvedValueOnce(new Response(secret, { status: 401 }));
      await call({ ...input, name: secret }, { ...options, maxAttempts: 1 });
      fetchMock.mockResolvedValueOnce(new Response(secret, { status: 500 }));
      await call({ ...input, name: secret }, { ...options, maxAttempts: 1 });
      fetchMock.mockRejectedValueOnce(new Error(secret));
      await call({ ...input, name: secret }, { ...options, maxAttempts: 1 });
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: secret } }] })));
      await call({ ...input, name: secret }, { ...options, maxAttempts: 1 });
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(warn.mock.calls)).toContain("HTTP 401");
    expect(JSON.stringify(warn.mock.calls)).toContain("network-or-response-failure");
  });
});
