import { useCallback, useEffect, useRef, useState } from "react";
import type { InstallBatchSnapshot, PluginStatusResponse } from "../shared/types.js";
import { isInstallBatchComplete } from "./install-batch-presentation.js";

const BATCH_KEY = "dsh-top100:last-install-batch:v1";
const RECENT_KEY = "dsh-top100:recent-install-batches:v1";
const COMPLETED_KEY = "dsh-top100:completed-install-batches:v1";
const PENDING_KEY = "dsh-top100:pending-submission:v1";
const SUBMIT_PATHS = new Set(["/dsh-top100/install-batch", "/dsh-top100/install", "/dsh-top100/manage", "/dsh-top100/retry"]);
export interface PendingSubmission { id: string; url: string; startedAt: number; state: "sending" | "uncertain" | "cancelling" }
type TaskError = { kind: "tracking" | "missing" | "cancel" | "submission"; message: string };
interface TaskState {
  batch: InstallBatchSnapshot | null; busy: string | null; ready: boolean; recovered: boolean;
  error: TaskError | null; pending: PendingSubmission | null; history: InstallBatchSnapshot[];
}
type StatusResponse = PluginStatusResponse & { submission?: InstallBatchSnapshot | null; submissionCancelled?: boolean };
const subscribers = new Set<(batch?: InstallBatchSnapshot, error?: TaskError | null) => void>();
// Storage-free fallback still protects all mounted sections when localStorage is blocked.
let pendingMemory: PendingSubmission | null = null;
let pendingStored = true;
const pendingControllers = new Map<string, AbortController>();
function readStorage(key: string): string | null { try { return window.localStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string | null): void { try { if (window.localStorage.getItem(key) === value) return; if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch { /* optional storage */ } }
function pendingSubmission(): PendingSubmission | null {
  let raw: string | null;
  try { raw = window.localStorage.getItem(PENDING_KEY); } catch { return pendingMemory; }
  if (!raw) return pendingStored ? null : pendingMemory;
  try {
    const value = JSON.parse(raw) as PendingSubmission;
    if (typeof value.id === "string" && /^[\w-]{1,128}$/.test(value.id) && SUBMIT_PATHS.has(value.url) && Number.isFinite(value.startedAt) && ["sending", "uncertain", "cancelling"].includes(value.state)) return value;
  } catch { /* an invalid record never supplies a payload or token */ }
  return pendingMemory;
}
function persistPending(value: PendingSubmission | null): void {
  pendingMemory = value;
  try { if (value) window.localStorage.setItem(PENDING_KEY, JSON.stringify(value)); else window.localStorage.removeItem(PENDING_KEY); pendingStored = true; }
  catch { pendingStored = false; }
}
function clearPending(id: string): void { if (pendingSubmission()?.id === id) persistPending(null); }
function recentIds(): string[] {
  try {
    const values: unknown = JSON.parse(readStorage(RECENT_KEY) ?? "[]");
    const ids = Array.isArray(values) ? values.filter((id): id is string => typeof id === "string") : [];
    const last = readStorage(BATCH_KEY);
    return [...new Set([...(last ? [last] : []), ...ids])].slice(0, 10);
  } catch { const last = readStorage(BATCH_KEY); return last ? [last] : []; }
}
function rememberBatches(batches: InstallBatchSnapshot[]): void {
  if (!batches.length) return;
  // Write one stable order per recovery. Writing each active batch in turn
  // would continually reorder storage and wake every other tab again.
  writeStorage(RECENT_KEY, JSON.stringify([...new Set([...batches.map((batch) => batch.batchId), ...recentIds()])].slice(0, 10)));
  writeStorage(BATCH_KEY, batches[0].batchId);
  batches.forEach(rememberCompletion);
}
function completedIds(): string[] {
  try {
    const ids: unknown = JSON.parse(readStorage(COMPLETED_KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, 10) : [];
  } catch { return []; }
}
// Persist only completion markers, never task output, paths or approval tokens.
function rememberCompletion(batch: InstallBatchSnapshot): void {
  if (isInstallBatchComplete(batch)) writeStorage(COMPLETED_KEY, JSON.stringify([...new Set([batch.batchId, ...completedIds()])].slice(0, 10)));
}
function rememberBatch(batch: InstallBatchSnapshot): void { rememberBatches([batch]); }
function forgetBatch(id: string): void {
  const ids = recentIds().filter((value) => value !== id);
  writeStorage(RECENT_KEY, JSON.stringify(ids));
  if (readStorage(BATCH_KEY) === id) writeStorage(BATCH_KEY, ids[0] ?? null);
  writeStorage(COMPLETED_KEY, JSON.stringify(completedIds().filter((value) => value !== id)));
}
class TaskHttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function readTask<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new TaskHttpError(body.error ?? `${response.status} ${response.statusText}`, response.status);
  return body;
}
function broadcast(batch?: InstallBatchSnapshot, error?: TaskError | null): void { if (batch) rememberBatch(batch); subscribers.forEach((accept) => accept(batch, error)); }

/** One owner above the settings sections, with a submission lock that survives remounts. */
export function useTaskTracker() {
  const [state, setState] = useState<TaskState>(() => ({ batch: null, busy: null, ready: false, recovered: false, error: null, pending: pendingSubmission(), history: [] }));
  const stateRef = useRef(state); stateRef.current = state;
  const [recovery, setRecovery] = useState(0);
  const [cancelling, setCancelling] = useState<string[]>([]);
  const generation = useRef(0);
  const mounted = useRef(false);
  const known = useRef(new Map<string, InstallBatchSnapshot>());
  const cancellationLocks = useRef(new Set<string>());
  const history = () => [...known.current.values()].filter(isInstallBatchComplete).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);

  const requestRecovery = useCallback((batch?: InstallBatchSnapshot, error?: TaskError | null): void => {
    generation.current++;
    if (batch) known.current.set(batch.batchId, batch);
    setState((previous) => ({ ...previous, batch: previous.batch ?? batch ?? null, ready: false, pending: pendingSubmission(), history: history(), error: error === undefined ? previous.error : error }));
    setRecovery((value) => value + 1);
  }, []);
  useEffect(() => { subscribers.add(requestRecovery); return () => { subscribers.delete(requestRecovery); }; }, [requestRecovery]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recoverSoon = (): void => {
      if (timer !== undefined) return;
      // A submission writes several keys. Coalesce them and always reread the
      // latest shared record, rather than adopting a possibly stale event value.
      timer = setTimeout(() => { timer = undefined; requestRecovery(); }, 50);
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || [PENDING_KEY, BATCH_KEY, RECENT_KEY].includes(event.key)) recoverSoon();
    };
    const onVisibility = (): void => { if (document.visibilityState === "visible") recoverSoon(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", recoverSoon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", recoverSoon);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [requestRecovery]);
  const track = useCallback((batch: InstallBatchSnapshot): void => { broadcast(batch); }, []);
  const retryTracking = useCallback(() => { requestRecovery(undefined, null); }, [requestRecovery]);
  const dismissNotice = useCallback(() => { setState((previous) => previous.error?.kind === "missing" ? { ...previous, error: null } : previous); }, []);

  useEffect(() => {
    const controller = new AbortController(); const epoch = generation.current;
    let disposed = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !disposed && !controller.signal.aborted && generation.current === epoch;
    void (async () => {
      try {
        const pending = pendingSubmission();
        const status = await readTask<StatusResponse>(`/dsh-top100/status${pending ? `?submissionId=${encodeURIComponent(pending.id)}` : ""}`, { signal: controller.signal, cache: "no-store" });
        if (!current()) return;
        if (pending && (status.submission || status.submissionCancelled)) {
          clearPending(pending.id);
          if (status.submissionCancelled) pendingControllers.get(pending.id)?.abort();
        }
        if (status.submission) known.current.set(status.submission.batchId, status.submission);
        for (const batch of status.activeBatches) known.current.set(batch.batchId, batch);
        rememberBatches([...status.activeBatches, ...(status.submission ? [status.submission] : [])]);
        let missing = stateRef.current.error?.kind === "missing";
        // IDs only are persisted; terminal details are read back from the host.
        for (const id of recentIds()) {
          if (status.activeBatches.some((batch) => batch.batchId === id) || known.current.get(id) && isInstallBatchComplete(known.current.get(id)!)) continue;
          try {
            const batch = await readTask<InstallBatchSnapshot>(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
            if (!current()) return;
            if (batch.batchId !== id) throw new Error("Task response did not match the requested batch");
            known.current.set(id, batch);
            rememberCompletion(batch);
          } catch (cause) {
            if (!current()) return;
            if (cause instanceof TaskHttpError && cause.status === 404) { missing ||= !completedIds().includes(id); forgetBatch(id); known.current.delete(id); }
            else throw cause;
          }
        }
        if (!current()) return;
        const remainingPending = pendingSubmission();
        const active = status.activeBatches.find((batch) => batch.batchId === stateRef.current.busy) ?? status.activeBatches[0];
        const last = active ?? (readStorage(BATCH_KEY) ? known.current.get(readStorage(BATCH_KEY)!) : null) ?? history()[0] ?? null;
        setState((previous) => ({ batch: last, busy: active?.batchId ?? null, ready: !remainingPending, pending: remainingPending, recovered: true, history: history(), error: missing ? { kind: "missing", message: "Task record is no longer available" } : (previous.error?.kind === "cancel" && !status.submissionCancelled) || previous.error?.kind === "submission" && !status.submission ? previous.error : null }));
        // Unknown does not mean rejected. Keep the ID locked until it is found or tombstoned.
        if (remainingPending) timer = setTimeout(requestRecovery, 1500);
      } catch (cause) {
        if (!current()) return;
        setState((previous) => ({ ...previous, ready: false, pending: pendingSubmission(), error: { kind: "tracking", message: cause instanceof Error ? cause.message : String(cause) } }));
      }
    })();
    return () => { disposed = true; controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [recovery, requestRecovery]);

  useEffect(() => {
    if (!state.busy || !state.ready) return;
    const batchId = state.busy; const epoch = generation.current; const controller = new AbortController();
    let disposed = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => !disposed && !controller.signal.aborted && generation.current === epoch;
    const poll = async (): Promise<void> => {
      let again = true; let delay = 800;
      try {
        const snapshot = await readTask<InstallBatchSnapshot>(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(batchId)}`, { signal: controller.signal, cache: "no-store" });
        if (!current()) return;
        if (snapshot.batchId !== batchId) throw new Error("Task response did not match the requested batch");
        known.current.set(batchId, snapshot);
        rememberCompletion(snapshot);
        if (isInstallBatchComplete(snapshot)) {
          again = false;
          setState((previous) => ({ ...previous, batch: snapshot, history: history() }));
          // Do not announce idle before checking for the next active batch.
          requestRecovery();
        } else setState((previous) => previous.busy !== batchId ? previous : ({ ...previous, batch: snapshot, error: previous.error?.kind === "cancel" ? previous.error : null }));
      } catch (cause) {
        if (!current()) return; delay = 2000;
        if (cause instanceof TaskHttpError && cause.status === 404) { again = false; forgetBatch(batchId); known.current.delete(batchId); requestRecovery(undefined, { kind: "missing", message: "Task record is no longer available" }); }
        else setState((previous) => ({ ...previous, error: { kind: "tracking", message: cause instanceof Error ? cause.message : String(cause) } }));
      } finally { if (current() && again) timer = setTimeout(() => { void poll(); }, delay); }
    };
    void poll();
    return () => { disposed = true; controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [state.busy, state.ready, recovery, requestRecovery]);

  const submit = useCallback(async (url: string, body: Record<string, unknown>): Promise<InstallBatchSnapshot | null> => {
    if (!SUBMIT_PATHS.has(url)) throw new Error("Unsupported submission endpoint");
    // Synchronous and shared across components: the second click cannot issue a new ID.
    if (pendingSubmission() || !stateRef.current.ready || stateRef.current.busy) { requestRecovery(); return null; }
    const pending: PendingSubmission = { id: crypto.randomUUID(), url, startedAt: Date.now(), state: "sending" };
    persistPending(pending); broadcast(undefined, null);
    const controller = new AbortController(); pendingControllers.set(pending.id, controller);
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const snapshot = await readTask<InstallBatchSnapshot>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, submissionId: pending.id }), signal: controller.signal });
      clearPending(pending.id); broadcast(snapshot); return snapshot;
    } catch (cause) {
      if (cause instanceof TaskHttpError && [400, 403, 404, 409, 422].includes(cause.status)) {
        if (pendingSubmission()?.id !== pending.id) return null;
        clearPending(pending.id); broadcast(undefined, { kind: "submission", message: cause.message }); throw cause;
      }
      if (pendingSubmission()?.id === pending.id) {
        persistPending({ ...pendingSubmission()!, state: pendingSubmission()!.state === "cancelling" ? "cancelling" : "uncertain" });
        broadcast(undefined, { kind: "submission", message: cause instanceof Error ? cause.message : String(cause) });
      }
      return null;
    } finally { clearTimeout(timer); pendingControllers.delete(pending.id); }
  }, [requestRecovery]);

  const cancelSubmission = useCallback(async (): Promise<void> => {
    const pending = pendingSubmission(); if (!pending || cancellationLocks.current.has(pending.id)) return;
    cancellationLocks.current.add(pending.id); persistPending({ ...pending, state: "cancelling" }); broadcast();
    try {
      const result = await readTask<{ cancelled: boolean; submission: InstallBatchSnapshot | null }>("/dsh-top100/cancel-submission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submissionId: pending.id }) });
      if (!result.cancelled) throw new Error("The host did not confirm cancellation of this submission");
      clearPending(pending.id); pendingControllers.get(pending.id)?.abort(); broadcast(result.submission ?? undefined, null);
    } catch (cause) {
      broadcast(undefined, { kind: "cancel", message: cause instanceof Error ? cause.message : String(cause) });
    } finally { cancellationLocks.current.delete(pending.id); }
  }, []);
  const cancel = useCallback(async (jobId: string): Promise<void> => {
    if (cancellationLocks.current.has(jobId)) return;
    cancellationLocks.current.add(jobId); setCancelling((ids) => [...ids, jobId]);
    const epoch = generation.current;
    try {
      const result = await readTask<{ cancelled: boolean }>("/dsh-top100/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) });
      if (!result.cancelled) throw new Error("The host did not accept this cancellation request");
    } catch (cause) { if (mounted.current && epoch === generation.current) setState((previous) => ({ ...previous, error: { kind: "cancel", message: cause instanceof Error ? cause.message : String(cause) } })); }
    finally { cancellationLocks.current.delete(jobId); if (mounted.current) setCancelling((ids) => ids.filter((id) => id !== jobId)); }
  }, []);
  return { ...state, cancelling, track, submit, cancel, cancelSubmission, retryTracking, dismissNotice };
}
export type TaskTracker = ReturnType<typeof useTaskTracker>;
