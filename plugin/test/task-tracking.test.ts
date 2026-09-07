import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Separate hook storage per actual parent/child component. Switching sections
// unmounts ManagedPage while leaving RankingsPage and its tracker mounted.
const host = vi.hoisted(() => {
  type Fiber = { cells: any[]; cursor: number; alive: boolean };
  const fibers = new Map<string, Fiber>(); let current: Fiber; let effects: Array<() => void> = [];
  const same = (a: unknown[], b: unknown[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const drop = (key: string) => { const fiber = fibers.get(key); if (!fiber) return; fiber.alive = false; fiber.cells.forEach((cell) => cell?.cleanup?.()); fibers.delete(key); };
  return {
    run<T>(key: string, render: () => T): T { current = fibers.get(key) ?? { cells: [], cursor: 0, alive: true }; fibers.set(key, current); current.cursor = 0; return render(); },
    flush() { const jobs = effects; effects = []; jobs.forEach((job) => job()); },
    drop, reset() { [...fibers.keys()].forEach(drop); effects = []; },
    useState(initial: any) { const owner = current; const i = owner.cursor++; if (!(i in owner.cells)) owner.cells[i] = { value: typeof initial === "function" ? initial() : initial }; return [owner.cells[i].value, (next: any) => { if (owner.alive) owner.cells[i].value = typeof next === "function" ? next(owner.cells[i].value) : next; }]; },
    useRef(initial: any) { const i = current.cursor++; if (!(i in current.cells)) current.cells[i] = { current: initial }; return current.cells[i]; },
    useMemo(fn: () => unknown, deps: unknown[]) { const i = current.cursor++; if (!(i in current.cells) || !same(current.cells[i].deps, deps)) current.cells[i] = { deps, value: fn() }; return current.cells[i].value; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const owner = current; const i = owner.cursor++; if (!(i in owner.cells) || !same(owner.cells[i].deps, deps)) { const previous = owner.cells[i]; owner.cells[i] = { deps }; effects.push(() => { if (owner.alive) { previous?.cleanup?.(); owner.cells[i].cleanup = fn(); } }); } },
  };
});
vi.mock("react", async (original) => { const actual = await original<typeof import("react")>(); vi.stubGlobal("React", actual); return { ...actual, useState: host.useState, useRef: host.useRef, useMemo: host.useMemo, useCallback: (fn: unknown, deps: unknown[]) => host.useMemo(() => fn, deps), useEffect: host.useEffect }; });
import * as React from "react";
import { RankingsPage } from "../src/client/RankingsPage.js";
import { ManagedPage } from "../src/client/ManagedPage.js";
import { UpdateReview } from "../src/client/UpdateReview.js";
import { TaskStatus } from "../src/client/TaskStatus.js";
import type { InstallBatchSnapshot } from "../src/shared/types.js";

const t = (key: string) => key;
function elements(node: ReactNode): ReactElement<any>[] { if (Array.isArray(node)) return node.flatMap(elements); if (!node || typeof node !== "object" || !("props" in node)) return []; const e = node as ReactElement<any>; return [e, ...elements(e.props.children)]; }
function text(node: ReactNode): string { if (Array.isArray(node)) return node.map(text).join(""); if (typeof node === "string" || typeof node === "number") return String(node); return node && typeof node === "object" && "props" in node ? text((node as ReactElement<any>).props.children) : ""; }
function button(tree: ReactNode, label: string) { const found = elements(tree).find((e) => e.type === "button" && text(e).startsWith(label)); expect(found, `button ${label}`).toBeTruthy(); return found!; }
function draw() {
  const root = host.run("root", () => RankingsPage({ t }));
  const child = elements(root).find((e) => e.type === ManagedPage);
  const managed = child ? host.run("managed", () => ManagedPage(child.props)) : null;
  if (!child) host.drop("managed");
  const reviewElement = elements(managed).find((e) => e.type === UpdateReview);
  const review = reviewElement ? UpdateReview(reviewElement.props) : null;
  const statusElement = elements(root).find((e) => e.type === TaskStatus)!;
  const status = TaskStatus(statusElement.props);
  host.flush();
  return { root, managed, review, status, tracking: statusElement.props.tracking };
}
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
async function settle() { let tree = draw(); for (let i = 0; i < 3; i++) { await tick(); tree = draw(); } return tree; }
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>((done) => { resolve = done; }); return { resolve, promise }; }
const batch = (id: string, phase = "installing"): InstallBatchSnapshot => ({ batchId: id, createdAt: 1, completed: ["installed", "failed", "cancelled"].includes(phase) ? 1 : 0, total: 1, requiresRestart: phase === "installed", jobs: [{ id: `${id}-job`, batchId: id, fullName: "demo", action: "update", kind: "bundle", phase, activationState: phase === "failed" ? "broken" : "unknown", error: phase === "failed" ? "Automatic recovery failed" : null, lastLine: "", cancelRequested: false }] } as InstallBatchSnapshot);
const reviewItem = { name: "demo", currentVersion: "1.0.0", preflight: { kind: "bundle", fullName: "acme/demo", approvalToken: "token", requiresExplicitApproval: true, provenance: { source: "npm", repositoryIdentity: "matched", requestedTarget: "demo@latest", resolvedTarget: "demo@2.0.0" }, lifecycleScripts: [{ name: "postinstall", command: "node build.js" }], risks: [{ code: "lifecycle-scripts", severity: "warning", summary: "scripts", detail: "scripts" }] } };
let records: Array<{ url: string; init?: RequestInit }>;
let storage: Map<string, string>;
let tasks: Map<string, InstallBatchSnapshot>;
let taskReads: Map<string, Array<ReturnType<typeof deferred>>>;
let cancelAccepted: boolean;
let submissions: Map<string, string>;
let tombstones: Set<string>;
const reads = (id: string) => records.filter((record) => record.url === `/dsh-top100/install-jobs?batchId=${id}`);
beforeEach(() => {
  host.reset(); vi.useFakeTimers(); vi.stubGlobal("React", React);
  records = []; storage = new Map(); tasks = new Map(); taskReads = new Map(); cancelAccepted = true; submissions = new Map(); tombstones = new Set();
  const windowEvents = new EventTarget(); const documentEvents = new EventTarget();
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: vi.fn((key: string, value: string) => storage.set(key, value)), removeItem: (key: string) => storage.delete(key) },
    confirm: () => true,
    addEventListener: vi.fn(windowEvents.addEventListener.bind(windowEvents)),
    removeEventListener: vi.fn(windowEvents.removeEventListener.bind(windowEvents)),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(documentEvents.addEventListener.bind(documentEvents)),
    removeEventListener: vi.fn(documentEvents.removeEventListener.bind(documentEvents)),
    dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents),
  });
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    records.push({ url, init });
    if (url.startsWith("/dsh-top100/status")) {
      const id = new URL(url, "http://localhost").searchParams.get("submissionId");
      return Promise.resolve(json({ activeBatches: [...tasks.values()].filter((task) => task.completed < task.total), submission: id && submissions.has(id) ? tasks.get(submissions.get(id)!) : null, submissionCancelled: id ? tombstones.has(id) : false }));
    }
    if (url.includes("install-jobs")) { const id = new URL(url, "http://localhost").searchParams.get("batchId")!; const pending = taskReads.get(id)?.shift(); return pending ? pending.promise : Promise.resolve(json(tasks.get(id))); }
    if (url.includes("rankings?")) return Promise.resolve(json({ items: [], total: 0, categories: [], generatedAt: "snapshot", cache: { ageMs: null }, scopeCounts: { plugins: 0, skills: 0 } }));
    if (url.includes("managed?")) return Promise.resolve(json({ items: [{ name: "demo", kind: "bundle", descriptionZh: "演示", version: "1.0.0", enabled: true, activationState: "live", updateAvailable: true, local: false, protected: false }], total: 1, profile: "web" }));
    if (url === "/dsh-top100/update-preflight") return Promise.resolve(json({ items: [reviewItem] }));
    if (url === "/dsh-top100/manage") {
      const id = JSON.parse(init!.body as string).submissionId as string;
      if (tombstones.has(id)) return Promise.resolve(new Response(JSON.stringify({ error: "Submission cancelled" }), { status: 409 }));
      if (submissions.has(id)) return Promise.resolve(json(tasks.get(submissions.get(id)!)));
      const accepted = batch("accepted"); tasks.set(accepted.batchId, accepted); submissions.set(id, accepted.batchId); return Promise.resolve(json(accepted));
    }
    if (url === "/dsh-top100/cancel-submission") { const id = JSON.parse(init!.body as string).submissionId; tombstones.add(id); return Promise.resolve(json({ cancelled: true, submission: submissions.has(id) ? tasks.get(submissions.get(id)!) : null })); }
    if (url === "/dsh-top100/cancel") return Promise.resolve(json({ cancelled: cancelAccepted }));
    throw new Error(`Unexpected request ${url}`);
  }));
});
afterEach(() => { host.reset(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function startUpdate() {
  let tree = await settle(); button(tree.root, "installedPage").props.onClick(); tree = await settle(); button(tree.managed, "updateAll").props.onClick(); tree = await settle();
  const checkbox = elements(tree.review).find((e) => e.type === "input" && e.props.type === "checkbox")!;
  checkbox.props.onChange({ target: { checked: true } }); tree = await settle(); button(tree.review, "confirmUpdate").props.onClick(); return settle();
}

describe("serial task tracking and lifecycle", () => {
  it("uses real scheduled polls without overlapping slow requests", async () => {
    tasks.set("A", batch("A")); const first = deferred(); const second = deferred(); taskReads.set("A", [first, second]); await settle();
    expect(reads("A")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000); expect(reads("A")).toHaveLength(1);
    first.resolve(json(batch("A"))); await settle(); await vi.advanceTimersByTimeAsync(799); expect(reads("A")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(reads("A")).toHaveLength(2);
    second.resolve(json(batch("A"))); await settle(); await vi.advanceTimersByTimeAsync(800); await settle(); expect(reads("A")).toHaveLength(3);
  });
  it("ignores an old response after accepting another batch, even if abort is ignored", async () => {
    tasks.set("A", batch("A")); const stale = deferred(); taskReads.set("A", [stale]); let tree = await settle();
    tasks.set("A", batch("A", "installed")); tasks.set("B", batch("B")); tree.tracking.track(batch("B")); tree = await settle(); expect(reads("A")[0].init!.signal!.aborted).toBe(true);
    stale.resolve(json(batch("A", "installed"))); tree = await settle(); expect(tree.tracking.busy).toBe("B"); expect(tree.tracking.batch.batchId).toBe("B");
    const previousAReads = reads("A").length; await vi.advanceTimersByTimeAsync(800); await settle(); expect(reads("A")).toHaveLength(previousAReads); expect(reads("B")).toHaveLength(2);
  });
  it("keeps updating and allows cancellation after the actual child unmounts/remounts", async () => {
    let tree = await startUpdate(); expect(tree.tracking.busy).toBe("accepted"); expect(storage.get("dsh-top100:last-install-batch:v1")).toBe("accepted");
    button(tree.root, "rankings").props.onClick(); tree = await settle(); expect(tree.managed).toBeNull(); const count = reads("accepted").length;
    await vi.advanceTimersByTimeAsync(800); await settle(); expect(reads("accepted").length).toBeGreaterThan(count);
    button(tree.root, "installedPage").props.onClick(); tree = await settle(); expect(text(tree.managed)).toContain("batchProgress"); expect(button(tree.managed, "updateAll").props.disabled).toBe(true);
    button(tree.managed, "cancel").props.onClick(); await settle(); const request = records.find((record) => record.url === "/dsh-top100/cancel")!; expect(JSON.parse(request.init!.body as string)).toEqual({ jobId: "accepted-job" });
  });
  it("recovers a completed update on full remount and routes retry through a new review", async () => {
    await startUpdate(); host.reset(); tasks.set("accepted", batch("accepted", "failed")); let tree = await settle();
    expect(tree.tracking.batch.batchId).toBe("accepted"); expect(tree.tracking.busy).toBeNull();
    button(tree.root, "viewInstallResult").props.onClick(); tree = await settle(); button(tree.root, "retry").props.onClick(); tree = await settle();
    expect(tree.managed).not.toBeNull(); expect(text(tree.review)).toContain("demo@2.0.0"); expect(button(tree.review, "confirmUpdate").props.disabled).toBe(true);
    expect(records.filter((record) => record.url === "/dsh-top100/update-preflight")).toHaveLength(2);
    expect(records.some((record) => record.url === "/dsh-top100/retry")).toBe(false);
    expect(records.filter((record) => record.url === "/dsh-top100/manage")).toHaveLength(1);
  });
  it("adopts a submitted task whose response arrived after the originating root unmounted", async () => {
    let tree = await settle(); const oldTrack = tree.tracking.track; host.reset(); tree = await settle(); expect(tree.tracking.busy).toBeNull();
    tasks.set("late", batch("late")); oldTrack(batch("late")); tree = await settle(); expect(tree.tracking.busy).toBe("late"); expect(tree.tracking.batch.batchId).toBe("late");
  });
  it("keeps authoritative polling and reports a rejected cancellation", async () => {
    let tree = await startUpdate(); cancelAccepted = false; button(tree.managed, "cancel").props.onClick(); tree = await settle();
    expect(text(tree.status)).toContain("cancelFailed"); expect(tree.tracking.busy).toBe("accepted"); const count = reads("accepted").length;
    await vi.advanceTimersByTimeAsync(800); tree = await settle(); expect(reads("accepted").length).toBeGreaterThan(count); expect(tree.tracking.busy).toBe("accepted");
  });
});


describe("submission reconciliation and multiple active batches", () => {
  it.each(["installing", "failed"])("recovers an accepted %s result when the original response is lost", async (phase) => {
    const normalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const response = await normalFetch(url, init);
      if (url === "/dsh-top100/manage") { tasks.set("accepted", batch("accepted", phase)); throw new TypeError("Response lost after server acceptance"); }
      return response;
    });
    const tree = await startUpdate();
    expect(tree.tracking.pending).toBeNull(); expect(tree.tracking.batch.batchId).toBe("accepted"); expect(text(tree.status)).not.toContain("submissionRejected");
    expect(tree.tracking.busy).toBe(phase === "failed" ? null : "accepted");
    expect(records.filter((record) => record.url === "/dsh-top100/manage")).toHaveLength(1);
    const id = JSON.parse(records.find((record) => record.url === "/dsh-top100/manage")!.init!.body as string).submissionId;
    expect(records.some((record) => record.url.includes(`submissionId=${id}`))).toBe(true);
    if (phase === "failed") expect(text(tree.status)).toContain("Automatic recovery failed");
  });
  it("keeps one shared pending ID across section switches and full remount until safely cancelled", async () => {
    const normalFetch = globalThis.fetch; const gate = deferred(); const sentIds: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url === "/dsh-top100/manage") { sentIds.push(JSON.parse(init!.body as string).submissionId); await gate.promise; }
      return normalFetch(url, init);
    });
    let tree = await startUpdate(); expect(tree.tracking.pending).not.toBeNull(); expect(tree.tracking.ready).toBe(false);
    const id = tree.tracking.pending.id;
    const persisted = storage.get("dsh-top100:pending-submission:v1")!;
    expect(persisted).toContain(id); expect(persisted).not.toContain("approvalToken"); expect(persisted).not.toContain('"token"');
    button(tree.root, "rankings").props.onClick(); tree = await settle(); button(tree.root, "installedPage").props.onClick(); tree = await settle();
    expect(button(tree.managed, "updateAll").props.disabled).toBe(true);
    await tree.tracking.submit("/dsh-top100/manage", { action: "update", names: ["demo"] }); expect(sentIds).toEqual([id]);
    host.reset(); tree = await settle(); expect(tree.tracking.pending.id).toBe(id); expect(tree.tracking.ready).toBe(false);
    expect(text(tree.status)).toContain("querySubmission");
    button(tree.status, "cancelSubmission").props.onClick(); tree = await settle();
    expect(tombstones.has(id)).toBe(true); expect(tree.tracking.pending).toBeNull(); expect(tree.tracking.ready).toBe(true);
    gate.resolve(json({})); tree = await settle(); expect(tasks.size).toBe(0); expect(tree.tracking.busy).toBeNull(); expect(sentIds).toEqual([id]);
  });
  it("recovers a lost cancellation acknowledgement from the persistent tombstone", async () => {
    const normalFetch = globalThis.fetch; const gate = deferred();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url === "/dsh-top100/manage") await gate.promise;
      const response = await normalFetch(url, init);
      if (url === "/dsh-top100/cancel-submission") throw new TypeError("Cancel acknowledgement lost");
      return response;
    });
    let tree = await startUpdate(); const id = tree.tracking.pending.id;
    button(tree.status, "cancelSubmission").props.onClick(); tree = await settle();
    expect(tombstones.has(id)).toBe(true); expect(tree.tracking.pending).toBeNull(); expect(tree.tracking.ready).toBe(true);
    gate.resolve(json({})); await settle(); expect(tasks.size).toBe(0);
  });
  it("shows an explicit rejection even if the originating page has unmounted", async () => {
    const normalFetch = globalThis.fetch; const gate = deferred();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url === "/dsh-top100/manage") { await gate.promise; return new Response(JSON.stringify({ error: "Approval expired" }), { status: 400 }); }
      return normalFetch(url, init);
    });
    await startUpdate(); host.reset(); let tree = await settle(); expect(tree.tracking.pending).not.toBeNull();
    gate.resolve(json({})); tree = await settle();
    expect(tree.tracking.pending).toBeNull(); expect(tree.tracking.ready).toBe(true);
    expect(text(tree.status)).toContain("submissionRejected"); expect(text(tree.status)).toContain("Approval expired"); expect(tasks.size).toBe(0);
  });
  it("takes over the second active batch before idle and preserves the first failure", async () => {
    tasks.set("A", batch("A")); tasks.set("B", batch("B")); storage.set("dsh-top100:last-install-batch:v1", "A");
    let tree = await settle(); expect(tree.tracking.busy).toBe("A");
    tasks.set("A", batch("A", "failed")); await vi.advanceTimersByTimeAsync(800); tree = await settle();
    expect(tree.tracking.busy).toBe("B"); expect(reads("B").length).toBeGreaterThan(0); expect(text(tree.status)).toContain("Automatic recovery failed");
    await vi.advanceTimersByTimeAsync(800); await settle(); expect(reads("B").length).toBeGreaterThan(1);
    tasks.set("B", batch("B", "installed")); await vi.advanceTimersByTimeAsync(800); tree = await settle();
    expect(tree.tracking.busy).toBeNull(); expect(tree.tracking.ready).toBe(true); expect(text(tree.status)).toContain("Automatic recovery failed");
    expect(tree.tracking.history.map((entry: InstallBatchSnapshot) => entry.batchId).sort()).toEqual(["A", "B"]);
  });
});


function storageEvent(key: string | null, newValue: string | null = null): void {
  const event = new Event("storage");
  Object.defineProperties(event, { key: { value: key }, newValue: { value: newValue } });
  window.dispatchEvent(event);
}
const statusReads = () => records.filter((record) => record.url.startsWith("/dsh-top100/status")).length;

describe("explicit rejections and cross-tab recovery", () => {
  it("releases the submission lock when a stale managed item is rejected with 404", async () => {
    const normalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => url === "/dsh-top100/manage"
      ? Promise.resolve(new Response(JSON.stringify({ error: "plugin is not installed" }), { status: 404 }))
      : normalFetch(url, init));
    let tree = await startUpdate();
    expect(tasks.size).toBe(0); expect(tree.tracking.pending).toBeNull(); expect(tree.tracking.ready).toBe(true);
    expect(text(tree.status)).toContain("submissionRejected"); expect(text(tree.status)).toContain("plugin is not installed");
    const count = statusReads(); await vi.advanceTimersByTimeAsync(10000); tree = await settle();
    expect(statusReads()).toBe(count); expect(tree.tracking.ready).toBe(true);
  });
  it("coalesces another tab's storage writes, tracks its task, and retains its failure", async () => {
    let tree = await settle(); expect(statusReads()).toBe(1);
    tasks.set("other-tab", batch("other-tab"));
    storage.set("dsh-top100:last-install-batch:v1", "other-tab");
    storage.set("dsh-top100:recent-install-batches:v1", JSON.stringify(["other-tab"]));
    storageEvent("dsh-top100:pending-submission:v1"); storageEvent("dsh-top100:last-install-batch:v1"); storageEvent("dsh-top100:recent-install-batches:v1");
    await vi.advanceTimersByTimeAsync(49); tree = await settle(); expect(statusReads()).toBe(1);
    await vi.advanceTimersByTimeAsync(1); tree = await settle();
    expect(statusReads()).toBe(2); expect(tree.tracking.busy).toBe("other-tab"); expect(tree.tracking.batch.batchId).toBe("other-tab");
    tasks.set("other-tab", batch("other-tab", "failed")); await vi.advanceTimersByTimeAsync(800); tree = await settle();
    expect(tree.tracking.busy).toBeNull(); expect(text(tree.status)).toContain("Automatic recovery failed");
  });
  it.each(["focus", "visibilitychange"])("refreshes authoritative tasks on %s after returning to the page", async (eventType) => {
    await settle(); tasks.set("external", batch("external"));
    if (eventType === "focus") window.dispatchEvent(new Event(eventType)); else document.dispatchEvent(new Event(eventType));
    await vi.advanceTimersByTimeAsync(50); const tree = await settle();
    expect(tree.tracking.busy).toBe("external"); expect(statusReads()).toBe(2);
  });
  it("ignores unrelated storage and hidden-page events, and cleans up listeners and timers", async () => {
    await settle(); storageEvent("unrelated"); Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(100); await settle(); expect(statusReads()).toBe(1);
    storageEvent(null); host.reset(); await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event("focus")); storageEvent("dsh-top100:last-install-batch:v1");
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(100); expect(statusReads()).toBe(1);
    expect(window.removeEventListener).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
  it("does not rewrite stable multi-batch storage and create cross-tab event loops", async () => {
    tasks.set("A", batch("A")); tasks.set("B", batch("B")); await settle();
    vi.mocked(window.localStorage.setItem).mockClear();
    for (let i = 0; i < 3; i++) { storageEvent("dsh-top100:recent-install-batches:v1"); await vi.advanceTimersByTimeAsync(50); await settle(); }
    expect(window.localStorage.setItem).not.toHaveBeenCalled(); expect(statusReads()).toBe(4);
  });
  it("rereads current pending storage instead of overwriting it with a stale event value", async () => {
    await settle();
    const current = { id: "current-tab-submission", url: "/dsh-top100/manage", startedAt: Date.now(), state: "uncertain" };
    storage.set("dsh-top100:pending-submission:v1", JSON.stringify(current));
    storageEvent("dsh-top100:pending-submission:v1", JSON.stringify({ ...current, id: "stale-submission" }));
    await vi.advanceTimersByTimeAsync(50); let tree = await settle();
    expect(tree.tracking.pending.id).toBe(current.id); expect(tree.tracking.ready).toBe(false);
    expect(JSON.parse(storage.get("dsh-top100:pending-submission:v1")!).id).toBe(current.id);
    await tree.tracking.cancelSubmission(); tree = await settle();
    expect(tombstones.has(current.id)).toBe(true); expect(tombstones.has("stale-submission")).toBe(false); expect(tree.tracking.pending).toBeNull();
  });
});
