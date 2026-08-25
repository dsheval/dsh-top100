import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CatalogItem,
  CatalogResponse,
  InstallBatchSnapshot,
  InstallJobSnapshot,
  PluginCategoryId,
  RankingView,
} from "../shared/types.js";
import type { Translate } from "./locales.js";

interface RankingsPageProps {
  t: Translate;
}

const VIEWS: RankingView[] = ["hot", "rising", "total", "category"];
const BATCH_LIMIT = 20;

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
  return body;
}

export function RankingsPage({ t }: RankingsPageProps) {
  const [view, setView] = useState<RankingView>("hot");
  const [category, setCategory] = useState<PluginCategoryId>("ai");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<"load" | "install">("load");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CatalogItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<InstallBatchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (
    nextView: RankingView,
    nextQuery: string,
    nextCategory: PluginCategoryId,
    offset = 0,
    append = false,
  ) => {
    setLoading(true);
    setErrorAction("load");
    setError(null);
    try {
      const payload = await readJson<CatalogResponse>(`/dsh-top100/rankings?${new URLSearchParams({
        view: nextView,
        category: nextCategory,
        q: nextQuery,
        offset: String(offset),
        limit: "40",
      })}`);
      setData(payload);
      setItems((current) => (append ? [...current, ...payload.items] : payload.items));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelected([]);
    void load(view, query, category, 0, false);
  }, [category, load, query, view]);

  useEffect(() => {
    if (!busy) return undefined;
    const refresh = (): void => {
      void readJson<InstallBatchSnapshot>(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`)
        .then(async (snapshot) => {
          setBatch(snapshot);
          if (snapshot.completed === snapshot.total) {
            setBusy(null);
            setSelected([]);
            setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
            await load(view, query, category, 0, false);
          }
        })
        .catch((cause: unknown) => {
          setErrorAction("install");
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 800);
    return () => window.clearInterval(timer);
  }, [busy, category, load, query, t, view]);

  const remaining = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.total - items.length);
  }, [data, items.length]);

  const jobsByName = useMemo(
    () => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])),
    [batch],
  );

  const activeCategory = data?.categories.find((definition) => definition.id === category);

  function toggleSelected(fullName: string): void {
    setSelected((current) =>
      current.includes(fullName) ? current.filter((value) => value !== fullName) : [...current, fullName],
    );
  }

  async function install(selectedItems: CatalogItem[]): Promise<void> {
    setConfirming(null);
    setNotice(null);
    setError(null);
    try {
      const result = await readJson<InstallBatchSnapshot>("/dsh-top100/install-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullNames: selectedItems.map((item) => item.fullName) }),
      });
      setBatch(result);
      setBusy(result.batchId);
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    await readJson("/dsh-top100/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
  }

  async function retryJob(jobId: string): Promise<void> {
    const result = await readJson<InstallBatchSnapshot>("/dsh-top100/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    setBatch(result);
    setBusy(result.batchId);
  }

  function jobPanel(job: InstallJobSnapshot) {
    return (
      <div className={`job job-${job.phase}`}>
        {t(`phase_${job.phase}`)}
        {job.lastLine ? <small>{job.lastLine}</small> : null}
        {job.error ? <small>{job.error}</small> : null}
        {!["installed", "failed", "cancelled"].includes(job.phase) ? (
          <button type="button" onClick={() => void cancelJob(job.id)}>
            {t("cancel")}
          </button>
        ) : ["failed", "cancelled"].includes(job.phase) ? (
          <button type="button" disabled={busy !== null} onClick={() => void retryJob(job.id)}>
            {t("retry")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dsh-top100">
      <header>
        <h2>{t("title")}</h2>
        <p className="lede">{t("subtitle")}</p>
        {data ? (
          <div className="meta">
            <span>
              {t("updated")} {data.snapshotDate}
            </span>
            <span>
              {t("source")} {data.dataUrl}
            </span>
            <span>{data.total} plugins</span>
          </div>
        ) : null}
      </header>

      <div className="toolbar">
        <input
          type="search"
          value={draft}
          placeholder={t("search")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") setQuery(draft.trim());
          }}
        />
        <button type="button" className="primary" onClick={() => setQuery(draft.trim())}>
          {t("search")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={selected.length === 0 || busy !== null}
          onClick={() => setConfirming(items.filter((item) => selected.includes(item.fullName)))}
        >
          {t("batchInstall")} ({selected.length})
        </button>
        <div className="tabs" role="tablist">
          {VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              className="tab"
              role="tab"
              aria-selected={view === id}
              onClick={() => {
                setView(id);
                setQuery("");
                setDraft("");
              }}
            >
              {t(id)}
            </button>
          ))}
        </div>
      </div>

      {view === "category" && data ? (
        <div className="category-panel">
          <div className="category-options" role="group" aria-label={t("categoryFilter")}>
            {data.categories.map((definition) => (
              <button
                key={definition.id}
                type="button"
                aria-pressed={category === definition.id}
                title={definition.description}
                onClick={() => {
                  setCategory(definition.id);
                  setQuery("");
                  setDraft("");
                }}
              >
                <span>{definition.label}</span>
                <small>{definition.count}</small>
              </button>
            ))}
          </div>
          {activeCategory ? <p className="category-description">{activeCategory.description}</p> : null}
        </div>
      ) : null}

      {notice ? <div className="banner">{notice}</div> : null}
      {error ? (
        <div className="error">
          {t(errorAction === "install" ? "installError" : "loadError")}: {error}{" "}
          {errorAction === "load" ? (
            <button type="button" onClick={() => void load(view, query, category, 0, false)}>
              {t("retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      {busy ? (
        <div className="banner">
          {batch ? `${t("batchProgress")} ${batch.completed}/${batch.total}` : t("installing")}
        </div>
      ) : null}

      <div className="list">
        {items.map((item) => {
          const job = jobsByName.get(item.fullName);
          return (
            <article key={`${item.fullName}-${item.rank}`}>
              <div className="rank">
                {item.installable && !item.installed ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(item.fullName)}
                    disabled={busy !== null || (selected.length >= BATCH_LIMIT && !selected.includes(item.fullName))}
                    title={selected.length >= BATCH_LIMIT && !selected.includes(item.fullName) ? t("batchLimit") : undefined}
                    aria-label={`${t("select")} ${item.fullName}`}
                    onChange={() => toggleSelected(item.fullName)}
                  />
                ) : null}
                <span>{item.rank}</span>
              </div>
              <div>
                <h3>
                  <a href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                    {item.fullName}
                  </a>
                </h3>
                <p className="desc">{item.descriptionZh || item.description}</p>
                <div className="facts">
                  <span>
                    {t("stars")} {item.stars}
                  </span>
                  <span>
                    {t("weekly")} {item.weeklyStars}
                  </span>
                  <span>
                    {t("daily")} {item.dailyStars}
                  </span>
                  <span>{item.type}</span>
                  {(item.tags ?? []).slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="actions">
                {job ? jobPanel(job) : item.installed ? (
                  <button type="button" disabled>
                    {t("installed")}
                  </button>
                ) : item.installable ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy !== null}
                    onClick={() => setConfirming([item])}
                  >
                    {t("install")}
                  </button>
                ) : (
                  <button type="button" disabled title={t("skillHint")}>
                    {t("browseOnly")}
                  </button>
                )}
                <a href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                  {t("github")}
                </a>
              </div>
            </article>
          );
        })}
        {!loading && items.length === 0 ? <p className="lede">{t("empty")}</p> : null}
      </div>

      {remaining > 0 ? (
        <button type="button" disabled={loading} onClick={() => void load(view, query, category, items.length, true)}>
          {t("more")} ({remaining})
        </button>
      ) : null}

      {confirming ? (
        <div className="mask" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3>{t("confirmTitle")}</h3>
            <p className="lede">{t("confirmBody")}</p>
            <div className="confirm-list">
              {confirming.map((item) => (
                <div key={item.fullName}>
                  <strong>{item.fullName}</strong>
                  <div>
                    {t("confirmSpec")}: <code>{item.installSpec?.spec ?? item.type}</code>
                  </div>
                </div>
              ))}
            </div>
            {confirming.some((item) => item.install?.needsConfig) ? (
              <p className="lede">{t("confirmNeedConfig")}</p>
            ) : null}
            <div className="toolbar">
              <button type="button" className="primary" onClick={() => void install(confirming)}>
                {t("confirm")}
              </button>
              <button type="button" onClick={() => setConfirming(null)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
