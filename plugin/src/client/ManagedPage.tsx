import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InstallBatchSnapshot, ManagedKind, ManagedListResponse, ManagedPlugin } from "../shared/types.js";
import type { Translate } from "./locales.js";

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

export function ManagedPage({ t, initialQuery = "" }: { t: Translate; initialQuery?: string }) {
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<ManagedListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<InstallBatchSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<ManagedListResponse>(`/dsh-top100/managed?q=${encodeURIComponent(query)}`);
      if (requestId === loadSequence.current) setData(payload);
    } catch (cause) {
      if (requestId === loadSequence.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!busy) return undefined;
    const refresh = (): void => {
      void readJson<InstallBatchSnapshot>(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`).then((snapshot) => {
        setBatch(snapshot);
        if (snapshot.completed === snapshot.total) {
          setBusy(null);
          setNotice(snapshot.requiresRestart ? t("restart") : t("manageComplete"));
          void load();
        }
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    };
    refresh();
    const timer = window.setInterval(refresh, 800);
    return () => window.clearInterval(timer);
  }, [busy, load, t]);

  const jobByName = useMemo(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);

  async function manage(action: "update" | "uninstall", names: string[], kind: ManagedKind): Promise<void> {
    if (action === "uninstall" && !window.confirm(t(kind === "skill" ? "confirmRemoveSkill" : "confirmRemovePlugin"))) return;
    setError(null);
    setNotice(null);
    try {
      const snapshot = await readJson<InstallBatchSnapshot>("/dsh-top100/manage", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, names, kind }),
      });
      setBatch(snapshot);
      setBusy(snapshot.batchId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function toggle(item: ManagedPlugin): Promise<void> {
    try {
      await readJson("/dsh-top100/toggle", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: item.name, enabled: !item.enabled }),
      });
      setNotice(t("restart"));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

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
        <button type="button" disabled={updates.length === 0 || busy !== null} onClick={() => void manage("update", updates.map((item) => item.name), "bundle")}>
          {t("updateAll")} ({updates.length})
        </button>
      </div>
      {data ? <p className="lede">{t("profile")}: {data.profile} · {data.total} {t("managedItems")}</p> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      {error ? <div className="error">{error} <button type="button" onClick={() => void load()}>{t("retry")}</button></div> : null}
      {busy && batch ? <div className="banner">{t("batchProgress")} {batch.completed}/{batch.total}</div> : null}
      {loading && !data && !error ? <div className="banner" role="status">{t("loadingInstalled")}</div> : null}
      <div className="list managed-list">
        {(data?.items ?? []).map((item) => {
          const job = jobByName.get(item.name);
          return (
            <article key={`${item.kind}-${item.name}`}>
              <div className="status-cell"><span className={`dot${item.enabled ? "" : " off"}`} aria-hidden="true" /></div>
              <div>
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
                {job ? <span className="job">{t(`phase_${job.phase}`)}<small>{job.lastLine}</small></span> : null}
                {item.kind === "bundle" ? <button type="button" disabled={item.protected || busy !== null} onClick={() => void toggle(item)}>{item.enabled ? t("disable") : t("enable")}</button> : null}
                {item.kind === "bundle" ? <button type="button" disabled={item.protected || item.local || busy !== null} onClick={() => void manage("update", [item.name], item.kind)}>{t("update")}</button> : null}
                <button type="button" className="danger" disabled={item.protected || busy !== null} onClick={() => void manage("uninstall", [item.name], item.kind)}>{t("uninstall")}</button>
              </div>
            </article>
          );
        })}
        {!loading && data?.items.length === 0 ? <p className="lede">{t("emptyInstalled")}</p> : null}
      </div>
    </div>
  );
}
