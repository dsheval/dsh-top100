import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";
import { readRuntimeStatus, type RuntimeBundle } from "../src/host/runtime-status.js";

function entry(name = "plugin-a", state: number | null = 2, id = "main", disabled = false) {
  return {
    id: `include:${id}`, options: { id, name, disabled },
    fiber: state === null ? undefined : { state, inject: {}, ctx: { get: vi.fn() } },
  };
}
function read(entries: unknown[], bundle: Partial<RuntimeBundle> = {}) {
  return readRuntimeStatus({ get: () => ({ entries: () => entries }) }, {
    isCurrentProfile: true, bundles: [{ name: "plugin-a", enabled: true, ...bundle }],
  })["plugin-a"];
}

describe("current Host runtime status", () => {
  it("does not inspect another Profile or start an unavailable observer", () => {
    const get = vi.fn(() => { throw new Error("must not run"); });
    expect(readRuntimeStatus({ get }, { isCurrentProfile: false, bundles: [{ name: "plugin-a", enabled: true, requiresRestart: true }] }))
      .toEqual({ "plugin-a": { state: "unknown", reason: "profile-not-active" } });
    expect(get).not.toHaveBeenCalled();
    expect(readRuntimeStatus(null, { isCurrentProfile: true, bundles: [{ name: "plugin-a", enabled: true }] })["plugin-a"])
      .toEqual({ state: "unknown", reason: "observer-unavailable" });
  });

  it("reads the optional loader once and never inspects tools, skills or child registries", () => {
    const entries = vi.fn(() => [entry()]);
    const get = vi.fn((name) => {
      if (name !== "loader") throw new Error("unexpected provider access");
      return { entries };
    });
    const ctx = { get, get registry() { throw new Error("child registry is not needed"); } };
    expect(readRuntimeStatus(ctx, { isCurrentProfile: true, bundles: [{ name: "plugin-a", enabled: true }, { name: "other", enabled: true }] })["plugin-a"])
      .toEqual({ state: "loaded", reason: "root-active" });
    expect(get).toHaveBeenCalledExactlyOnceWith("loader");
    expect(entries).toHaveBeenCalledTimes(1);
  });

  it("maps declared IDs for wrappers and subpath modules, without package prefix collisions", () => {
    expect(read([entry("other-host-module")], { entryIds: ["main"] }).state).toBe("loaded");
    expect(read([entry("plugin-a/host")]).state).toBe("loaded");
    expect(read([entry("plugin-ab")]).state).toBe("unknown");
    expect(read([entry("other-host-module")], { entryIds: ["missing"] }))
      .toEqual({ state: "unknown", reason: "entry-not-found" });
    expect(read([entry(), entry("other", 2)], { entryIds: ["main"] }).reason).toBe("entry-ambiguous");
  });

  it("requires all observed enabled roots and does not mistake a group for plugin activation", () => {
    const group = { ...entry("group"), options: { id: "group", name: "group", group: true } };
    expect(read([group], { entryIds: ["group"] }).state).toBe("unknown");
    expect(read([group, entry()], { entryIds: ["group", "main"] }).state).toBe("loaded");
    expect(read([entry(), entry("plugin-a/second", 1, "second")]).state).toBe("unknown");
    expect(read([entry(), entry("plugin-a/optional", null, "optional", true)]).state).toBe("loaded");
  });

  it("does not execute disabled expressions or expose private failure details", () => {
    const failed = {
      ...entry("plugin-a", 3),
      get disabled() { throw new Error("would evaluate configuration"); },
      fiber: { state: 3, get _error() { throw new Error("secret raw stack"); } },
    };
    expect(read([failed])).toEqual({ state: "failed", reason: "root-failed" });
    const conditional = entry("plugin-a", null);
    Object.assign(conditional.options, { disabled: { __jsExpr: "throw new Error('do not evaluate')" } });
    expect(read([conditional]).state).toBe("unknown");
  });

  it("reports missing required root services but does not invoke service checks", () => {
    const get = vi.fn((name) => name === "present" ? { check: () => { throw new Error("must not execute"); } } : undefined);
    const pending = { ...entry("plugin-a", 0), fiber: { state: 0, inject: { required: null, present: null }, ctx: { get } } };
    expect(read([pending])).toEqual({ state: "missing-services", reason: "required-services-missing", missingServices: ["required"] });
    expect(get.mock.calls.map(([name]) => name)).toEqual(["required", "present"]);
    pending.fiber.ctx.get = vi.fn(() => ({}));
    expect(read([pending])).toEqual({ state: "unknown", reason: "root-not-active" });
  });

  it("keeps known pending changes above stale active instances, even without Loader support", () => {
    expect(read([entry()], { requiresRestart: true })).toEqual({ state: "restart-required", reason: "configuration-changed" });
    expect(read([entry("plugin-a", 3)], { requiresRestart: true })).toEqual({ state: "failed", reason: "root-failed" });
    const pending = { ...entry(), fiber: { state: 0, inject: { required: null }, ctx: { get: () => undefined } } };
    expect(read([pending], { requiresRestart: true }).state).toBe("missing-services");
    expect(readRuntimeStatus(null, { isCurrentProfile: true, bundles: [{ name: "plugin-a", enabled: true, requiresRestart: true }] })["plugin-a"].state)
      .toBe("restart-required");
    expect(read([entry()], { enabled: false }).state).toBe("restart-required");
    expect(read([entry("plugin-a", null, "main", true)], { enabled: false })).toEqual({ state: "inactive", reason: "disabled" });
  });

  it("falls back independently for unsupported or throwing runtime surfaces", () => {
    const bundles = [{ name: "plugin-a", enabled: true }, { name: "plugin-b", enabled: true }];
    expect(readRuntimeStatus({ get: () => { throw new Error("SDK unavailable"); } }, { isCurrentProfile: true, bundles })["plugin-a"].reason)
      .toBe("observation-failed");
    const bad = { ...entry(), get fiber() { throw new Error("SDK changed"); } };
    const statuses = readRuntimeStatus({ get: () => ({ entries: () => [bad, entry("plugin-b", 2, "other")] }) }, { isCurrentProfile: true, bundles });
    expect(statuses["plugin-a"].reason).toBe("observation-failed");
    expect(statuses["plugin-b"].state).toBe("loaded");
  });

  it("observes real Cordis root transitions without activating a required or optional child", async () => {
    const ctx = new Context();
    let disposeProvider: (() => Promise<unknown>) | undefined;
    const started = vi.fn();
    const required = ctx.plugin({ name: "controlled-required", inject: ["runtimeTestRequired"], apply: started });
    const optionalStarted = vi.fn();
    let child: { state: number } | undefined;
    const active = await ctx.plugin((scope) => {
      child = scope.inject(["runtimeTestOptional"], optionalStarted);
    });
    const get = () => ({ entries: () => [
      { ...entry("plugin-a", 0), fiber: required },
      { ...entry("plugin-b", 2, "active"), fiber: active },
    ] });
    const bundles = [{ name: "plugin-a", enabled: true }, { name: "plugin-b", enabled: true }];
    try {
      const before = readRuntimeStatus({ get }, { isCurrentProfile: true, bundles });
      expect(before["plugin-a"]).toEqual({ state: "missing-services", reason: "required-services-missing", missingServices: ["runtimeTestRequired"] });
      expect(before["plugin-b"].state).toBe("loaded");
      expect(child?.state).toBe(0);
      expect(started).not.toHaveBeenCalled();
      expect(optionalStarted).not.toHaveBeenCalled();
      const provider = await ctx.plugin((scope) => { scope.provide("runtimeTestRequired", {}); });
      disposeProvider = () => provider.dispose();
      await required.await();
      expect(readRuntimeStatus({ get }, { isCurrentProfile: true, bundles })["plugin-a"].state).toBe("loaded");
      expect(started).toHaveBeenCalledTimes(1);
      expect(optionalStarted).not.toHaveBeenCalled();
    } finally {
      await required.dispose();
      await active.dispose();
      await disposeProvider?.();
    }
  });
});
