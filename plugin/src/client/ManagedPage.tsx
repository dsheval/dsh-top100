import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InstallBatchSnapshot, ManagedKind, ManagedListResponse, ManagedPlugin, UpdatePreflightItem } from "../shared/types.js";
import { LatestRequest } from "./latest-request.js";
import type { TaskTracker } from "./use-task-tracker.js";
import { UpdateReview } from "./UpdateReview.js";
import type { Translate } from "./locales.js";

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

export function ManagedPage({ t, tracking, retryUpdate, onRetryConsumed, initialQuery = "" }: {
  t: Translate; tracking: TaskTracker; initialQuery?: string;
  retryUpdate?: { id: number; names: string[] } | null; onRetryConsumed?: () => void;
}) {
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<ManagedListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { batch, busy } = tracking;
  const completedBatch = useRef<string | null>(null);
  const consumedRetry = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const updateRequest = useRef(new LatestRequest());
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<UpdatePreflightItem[] | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [retryNames, setRetryNames] = useState<string[] | null>(null);
  const submissionLock = useRef(false);
  useEffect(() => () => updateRequest.current.cancel(), []);

  const load = useCallback(async () => {
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<ManagedListResponse>(`/dsh-top100/managed?q=${encodeURIComponent(query)}`);
      if (requestId === loadSequence.current) setData(payload);
    } catch (cause) {
      if (requestId === loadSequence.current) { setRetryNames(null); setError(cause instanceof Error ? cause.message : String(cause)); }
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!batch || busy || batch.completed !== batch.total || completedBatch.current === batch.batchId) return;
    completedBatch.current = batch.batchId;
    const failed = batch.jobs.some((job) => job.phase === "failed" || job.activationState === "broken");
    const cancelled = batch.jobs.some((job) => job.phase === "cancelled");
    setNotice(failed ? t("manageFailed") : cancelled ? t("manageCancelled") : batch.requiresRestart ? t("restart") : t("manageComplete"));
    void load();
  }, [batch, busy, load, t]);

  useEffect(() => {
    if (!retryUpdate || consumedRetry.current === retryUpdate.id || busy || !tracking.ready) return;
    consumedRetry.current = retryUpdate.id;
    void prepareUpdates(retryUpdate.names);
    onRetryConsumed?.();
  }, [retryUpdate, busy, tracking.ready, onRetryConsumed]);

  const jobByName = useMemo(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);

  async function manage(action: "uninstall", names: string[], kind: ManagedKind): Promise<void> {
    if (!window.confirm(t(kind === "skill" ? "confirmRemoveSkill" : "confirmRemovePlugin"))) return;
    setError(null);
    setRetryNames(null);
    setNotice(null);
    try {
      await tracking.submit("/dsh-top100/manage", { action, names, kind });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function prepareUpdates(names: string[]): Promise<void> {
    if (!names.length || submitting || busy || !tracking.ready) return;
    const requestedNames = [...new Set(names)];
    const request = updateRequest.current.start();
    setPreparing(true); setReview(null); setAccepted(false); setRetryNames(null); setError(null); setNotice(null);
    try {
      const response = await readJson<{ items: UpdatePreflightItem[] }>("/dsh-top100/update-preflight", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ names: requestedNames }), signal: request.signal,
      });
      if (!request.isCurrent()) return;
      const byName = new Map(response.items.map((item) => [item.name, item]));
      if (response.items.length !== requestedNames.length || byName.size !== requestedNames.length || requestedNames.some((name) => {
        const item = byName.get(name);
        return !item || item.preflight.kind !== "bundle" || !item.preflight.approvalToken || !item.preflight.provenance.resolvedTarget;
      })) throw new Error(t("updatePreflightIncomplete"));
      const ordered = requestedNames.map((name) => byName.get(name)!);
      setReview(ordered);
      setAccepted(!ordered.some((item) => item.preflight.requiresExplicitApproval));
    } catch (cause) {
      if (!request.isCurrent()) return;
      setRetryNames(requestedNames); setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (request.isCurrent()) setPreparing(false); }
  }

  function cancelUpdateReview(): void {
    updateRequest.current.cancel(); setPreparing(false); setReview(null); setRetryNames(null); setAccepted(false);
    setNotice(t("updatePreflightCancelled"));
  }

  async function confirmUpdates(): Promise<void> {
    if (!review?.length || !accepted || submissionLock.current) return;
    const approved = review;
    submissionLock.current = true; setSubmitting(true); setReview(null); setError(null); setNotice(null);
    try {
      await tracking.submit("/dsh-top100/manage", { action: "update", kind: "bundle", names: approved.map((item) => item.name), approvals: approved.map((item) => ({
        name: item.name, approvalToken: item.preflight.approvalToken, risksAccepted: item.preflight.requiresExplicitApproval ? accepted : true,
      })) });
    } catch (cause) {
      // Tokens may have expired or been consumed; retries must request a new full review.
      setRetryNames(approved.map((item) => item.name)); setError(cause instanceof Error ? cause.message : String(cause));
    } finally { submissionLock.current = false; setSubmitting(false); }
  }

  async function toggle(item: ManagedPlugin): Promise<void> {
    setRetryNames(null);
    try {
      await readJson("/dsh-top100/toggle", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: item.name, enabled: !item.enabled }),
      });
      setNotice(t("restart"));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const operationBlocked = !tracking.ready || busy !== null || preparing || submitting || review !== null;
  const updates = data?.items.filter((item) => item.kind === "bundle" && item.updateAvailable && !item.protected && !item.local) ?? [];

  function descriptionFor(item: ManagedPlugin): string {
    const supplied = item.descriptionZh.trim();
    if (supplied) return supplied;
    return item.kind === "skill"
      ? `${t("installedSkillFallback")}：${item.name}。${t("noChineseDescription")}。`
      : `${t("installedPluginFallback")}：${item.name}。${t("noChineseDescription")}。`;
  }

  return (
    <div className="managed-page">
      <div>
        <h3>{t("installedManagerTitle")}</h3>
        <p className="lede">{t("installedManagerHint")}</p>
      </div>
      <div className="toolbar">
        <input type="search" value={draft} placeholder={t("searchInstalled")} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(draft.trim()); }} />
        <button type="button" className="primary" onClick={() => setQuery(draft.trim())}>{t("search")}</button>
        <button type="button" disabled={updates.length === 0 || operationBlocked} onClick={() => void prepareUpdates(updates.map((item) => item.name))}>
          {t("updateAll")} ({updates.length})
        </button>
      </div>
      {data ? <p className="lede">{t("profile")}: {data.profile} · {data.total} {t("managedItems")}</p> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      {error ? <div className="error">{error} <button type="button" disabled={operationBlocked} onClick={() => void (retryNames ? prepareUpdates(retryNames) : load())}>{t("retry")}</button></div> : null}
      {preparing ? <div className="install-activity-banner is-active" role="status"><div><strong>{t("preflighting")}</strong><span>{t("updatePreflightWait")}</span></div><button type="button" onClick={cancelUpdateReview}>{t("cancel")}</button></div> : null}
      {submitting ? <div className="banner" role="status">{t("updateSubmitting")}</div> : null}
      {review ? <UpdateReview items={review} accepted={accepted} onAccepted={setAccepted} onCancel={cancelUpdateReview} onConfirm={() => void confirmUpdates()} t={t} /> : null}
      {busy && batch ? <div className="banner" role="status">{t("batchProgress")} {batch.completed}/{batch.total}
        {batch.jobs.filter((job) => !["installed", "failed", "cancelled"].includes(job.phase)).map((job) => <div key={job.id}>
          <span>{job.fullName} · {t(`phase_${job.phase}`)}</span>{" "}
          <button type="button" disabled={job.cancelRequested || tracking.cancelling.includes(job.id)} onClick={() => void tracking.cancel(job.id)}>{t("cancel")}</button>
        </div>)}
      </div> : null}
      {loading && !data && !error ? <div className="banner" role="status">{t("loadingInstalled")}</div> : null}
      <div className="list managed-list">
        {(data?.items ?? []).map((item) => {
          const job = jobByName.get(item.name);
          return (
            <article key={`${item.kind}-${item.name}`}>
              <div className="status-cell"><span className={`dot${item.enabled ? "" : " off"}`} aria-hidden="true" /></div>
              <div className="managed-copy">
                <h3>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</h3>
                <p className="desc">{descriptionFor(item)}</p>
                <div className="facts">
                  <span className="badge">{t(item.kind === "skill" ? "skillKind" : "bundleKind")}</span>
                  <span className={`badge${item.enabled ? "" : " muted"}`}>{t(item.enabled ? "enabled" : "disabled")}</span>
                  <span className={`badge activation-${item.activationState}`}>{t(`activation_${item.activationState}`)}</span>
                  <span>{t("version")}: {item.version ?? "—"}</span>
                  {item.latest ? <span>{t("latest")}: {item.latest}</span> : null}
                  {item.fullName && item.fullName !== item.name ? <span>{t("project")}: {item.fullName}</span> : null}
                  {item.local ? <span className="badge">{t("localLink")}</span> : null}
                  {item.protected ? <span className="badge">{t("protected")}</span> : null}
                  {item.updateAvailable ? <span className="badge warn">{t("updateAvailable")}</span> : null}
                </div>
              </div>
              <div className="actions row-actions">
                {job ? <span className="job">{t(`phase_${job.phase}`)}<small>{job.error ?? job.message ?? job.lastLine}</small></span> : null}
                {job?.action === "update" && (job.phase === "failed" || job.phase === "cancelled") ? <button type="button" disabled={item.protected || item.local || operationBlocked} onClick={() => void prepareUpdates([item.name])}>{t("retry")}</button> : null}
                {item.kind === "bundle" ? <button type="button" disabled={item.protected || operationBlocked} onClick={() => void toggle(item)}>{item.enabled ? t("disable") : t("enable")}</button> : null}
                {item.kind === "bundle" ? <button type="button" disabled={item.protected || item.local || operationBlocked} onClick={() => void prepareUpdates([item.name])}>{t("update")}</button> : null}
                <button type="button" className="danger" disabled={item.protected || operationBlocked} onClick={() => void manage("uninstall", [item.name], item.kind)}>{t("uninstall")}</button>
              </div>
            </article>
          );
        })}
        {!loading && data?.items.length === 0 ? <p className="lede">{t("emptyInstalled")}</p> : null}
      </div>
    </div>
  );
}
