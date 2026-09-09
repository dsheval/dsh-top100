import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareUpdateBatch } from "../src/client/update-batch.js";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function item(name: string, token: string, expiresAt: number) {
  return { name, currentVersion: "1.0.0", preflight: { kind: "bundle", approvalToken: token, expiresAt,
    provenance: { requestedTarget: `${name}@beta`, resolvedTarget: `${name}@2.0.0-beta.1` } } };
}

describe("batched update confirmation window", () => {
  it("collects sixty slow checks before issuing the fresh confirmation tokens", async () => {
    vi.useFakeTimers();
    const drafts: ReturnType<typeof item>[] = [];
    const groups: number[] = [];
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (body.action === "start") return Response.json({ sessionToken: "batch-session", expiresAt: Date.now() + 3600000 });
      if (body.action === "finalize") return Response.json({ items: drafts.map((draft) => item(draft.name, `ready:${draft.name}`, Date.now() + 600000)) });
      expect(url).toBe("/dsh-top100/update-preflight");
      expect(body.sessionToken).toBe("batch-session");
      groups.push(body.names.length);
      const checked = body.names.map((name: string) => {
        vi.advanceTimersByTime(15000);
        return item(name, `draft:${name}`, Date.now() + 3600000);
      });
      drafts.push(...checked);
      return Response.json({ items: checked, issues: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await prepareUpdateBatch(Array.from({ length: 60 }, (_, i) => `plugin-${i}`), "preserve", { signal: new AbortController().signal });
    expect(groups).toEqual([20, 20, 20]);
    expect(result.items).toHaveLength(60);
    expect(result.items.every((checked) => checked.preflight.approvalToken.startsWith("ready:") && checked.preflight.expiresAt === Date.now() + 600000)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("retains skipped results while finalizing only successful checks", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (body.action === "start") return Response.json({ sessionToken: "batch-session" });
      if (body.action === "finalize") return Response.json({ items: [item("demo", "ready", Date.now() + 600000)] });
      return Response.json({ items: [item("demo", "draft", Date.now() + 3600000)], issues: [{ name: "current", status: "current", message: "已是最新" }] });
    }));
    const result = await prepareUpdateBatch(["demo", "current"], "preserve", { signal: new AbortController().signal });
    expect(result.items.map((checked) => checked.name)).toEqual(["demo"]);
    expect(result.issues.map((issue) => issue.name)).toEqual(["current"]);
  });

  it.each(["cancel", "incomplete", "changed-target"])("cleans up the non-installable session after %s", async (failure) => {
    const controller = new AbortController();
    const actions: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (body.action) actions.push(body.action);
      if (body.action === "start") return Response.json({ sessionToken: "batch-session" });
      if (body.action === "cancel") return Response.json({ ok: true });
      if (body.action === "finalize") {
        const ready = item("demo", "ready", Date.now() + 600000);
        ready.preflight.provenance.resolvedTarget = "demo@3.0.0";
        return Response.json({ items: [ready] });
      }
      if (failure === "cancel") controller.abort();
      return Response.json({ items: failure === "incomplete" ? [] : [item("demo", "draft", Date.now() + 3600000)] });
    }));
    await expect(prepareUpdateBatch(["demo"], "preserve", { signal: controller.signal })).rejects.toThrow();
    expect(actions.at(-1)).toBe("cancel");
    if (failure !== "changed-target") expect(actions).not.toContain("finalize");
  });
});
