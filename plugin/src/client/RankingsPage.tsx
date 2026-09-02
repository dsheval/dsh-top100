import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogItem,
  CatalogResponse,
  CatalogScope,
  InstallBatchSnapshot,
  InstallJobSnapshot,
  InstallPreflight,
  InstallAvailability,
  PluginStatusResponse,
  PluginCategoryId,
  RankingView,
} from "../shared/types.js";
import type { Translate } from "./locales.js";
import { DiagnosticsPage } from "./DiagnosticsPage.js";
import { installStage, isInstallBatchComplete } from "./install-batch-presentation.js";
import { presentInstallCapability } from "./install-capability.js";
import {
  installStatus,
  presentInstallError,
  type InstallErrorKind,
} from "./install-presentation.js";
import { ManagedPage } from "./ManagedPage.js";
import { shouldRestartPagination } from "./pagination.js";
import { presentRepositoryIdentity } from "./repository-identity.js";
import { presentInstallRisk } from "./trust-presentation.js";

interface RankingsPageProps {
  t: Translate;
}

const SORT_VIEWS: RankingView[] = ["hot", "rising", "total"];
const AUXILIARY_CATALOG_SCOPES: CatalogScope[] = ["skills", "ecosystem"];
const LAST_BATCH_KEY = "dsh-top100:last-install-batch:v1";
const DSHEVAL_SITE = "https://www.dsheval.ai";
type PageSection = "rankings" | "installed" | "diagnostics";
function RankTrustMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <g className="rank-mark-list">
        <circle cx="11" cy="14" r="2" />
        <path d="M17 14h17" />
        <circle cx="11" cy="23" r="2" />
        <path d="M17 23h12" />
        <circle cx="11" cy="32" r="2" />
        <path d="M17 32h7" />
      </g>
      <path className="rank-mark-check" d="m28.5 30.5 3.5 3.5 7-9" />
    </svg>
  );
}

function rankingBasisKey(view: RankingView, query: string): string {
  return query ? "basis_search" : `basis_${view}`;
}

function rankingBasisShortKey(view: RankingView, query: string): string {
  return query ? "basisShort_search" : `basisShort_${view}`;
}

function deltaLabel(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const SKELETON_CARDS = Array.from({ length: 6 }, (_, index) => (
  <div className="card-skeleton" aria-hidden="true" key={index}>
    <span className="skeleton-rank" />
    <div>
      <span className="skeleton-line skeleton-title" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-short" />
      <span className="skeleton-pills" />
    </div>
  </div>
));

const ERROR_LOCALE_KEYS: Record<InstallErrorKind, string> = {
  "ignored-builds": "ignoredBuilds",
  network: "network",
  timeout: "timeout",
  permission: "permission",
  lockfile: "lockfile",
  profile: "profile",
  source: "source",
  generic: "generic",
};

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) throw new HttpError(body.error || body.message || `${response.status} ${response.statusText}`, response.status);
  return body;
}

function rememberedBatchId(): string | null {
  try { return window.localStorage.getItem(LAST_BATCH_KEY); } catch { return null; }
}

function rememberBatch(batchId: string | null): void {
  try {
    if (batchId) window.localStorage.setItem(LAST_BATCH_KEY, batchId);
    else window.localStorage.removeItem(LAST_BATCH_KEY);
  } catch { /* storage unavailable */ }
}

function cacheAgeLabel(ageMs: number | null, t: Translate): string {
  if (ageMs === null) return t("cacheAgeUnknown");
  const minutes = Math.max(0, Math.round(ageMs / 60_000));
  if (minutes < 60) return `${minutes} ${t("minutesAgo")}`;
  return `${Math.round(minutes / 60)} ${t("hoursAgo")}`;
}

export function RankingsPage({ t }: RankingsPageProps) {
  const [section, setSection] = useState<PageSection>("rankings");
  const [view, setView] = useState<RankingView>("hot");
  const [category, setCategory] = useState<PluginCategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [catalogScope, setCatalogScope] = useState<CatalogScope>("plugins");
  const [installAvailability, setInstallAvailability] = useState<InstallAvailability>("all");
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<"load" | "install">("load");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(() => rememberedBatchId());
  const [preparing, setPreparing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CatalogItem[] | null>(null);
  const [preflights, setPreflights] = useState<InstallPreflight[]>([]);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [batch, setBatch] = useState<InstallBatchSnapshot | null>(null);
  const [installActivityOpen, setInstallActivityOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const loadedSnapshot = useRef<string | null>(null);
  const recoveryChecked = useRef(false);

  const load = useCallback(async (
    nextView: RankingView,
    nextQuery: string,
    nextCategory: PluginCategoryId | null,
    nextCatalogScope: CatalogScope,
    nextInstallAvailability: InstallAvailability,
    offset = 0,
    append = false,
  ) => {
    const requestId = ++loadSequence.current;
    const requestSnapshot = loadedSnapshot.current;
    setLoading(true);
    setErrorAction("load");
    setError(null);
    if (!append) {
      loadedSnapshot.current = null;
      setData(null);
      setItems([]);
    }
    try {
      const fetchPage = (pageOffset: number): Promise<CatalogResponse> => readJson<CatalogResponse>(
        `/dsh-top100/rankings?${new URLSearchParams({
          view: nextView,
          category: nextCategory ?? "",
          catalogScope: nextCatalogScope,
          installAvailability: nextInstallAvailability,
          q: nextQuery,
          offset: String(pageOffset),
          limit: "40",
        })}`,
      );
      let payload = await fetchPage(offset);
      if (requestId !== loadSequence.current) return;
      let shouldAppend = append;
      if (shouldRestartPagination(append, requestSnapshot, payload.generatedAt)) {
        payload = await fetchPage(0);
        if (requestId !== loadSequence.current) return;
        shouldAppend = false;
      }
      loadedSnapshot.current = payload.generatedAt;
      setData(payload);
      setItems((current) => (shouldAppend ? [...current, ...payload.items] : payload.items));
    } catch (cause) {
      if (requestId !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      if (!append) setItems([]);
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section !== "rankings") return;
    void load(view, query, category, catalogScope, installAvailability, 0, false);
  }, [catalogScope, category, installAvailability, load, query, section, view]);

  useEffect(() => {
    if (recoveryChecked.current) return;
    recoveryChecked.current = true;
    if (busy) return;
    void readJson<PluginStatusResponse>("/dsh-top100/status")
      .then((status) => {
        const recovered = status.activeBatches[0];
        if (!recovered) return;
        rememberBatch(recovered.batchId);
        setBatch(recovered);
        setBusy(recovered.batchId);
        setNotice(t("installTaskRecovered"));
      })
      .catch(() => { /* the normal page error surface handles host availability */ });
  }, [busy, t]);

  useEffect(() => {
    if (!busy) return undefined;
    const refresh = (): void => {
      void readJson<InstallBatchSnapshot>(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`)
        .then(async (snapshot) => {
          setBatch(snapshot);
          if (isInstallBatchComplete(snapshot)) {
            rememberBatch(null);
            setBusy(null);
            setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
            await load(view, query, category, catalogScope, installAvailability, 0, false);
          }
        })
        .catch((cause: unknown) => {
          if (cause instanceof HttpError && cause.status === 404) {
            rememberBatch(null);
            setBusy(null);
            setBatch(null);
            setNotice(t("installTaskUnavailable"));
            setError(null);
            return;
          }
          setErrorAction("install");
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 800);
    return () => window.clearInterval(timer);
  }, [busy, catalogScope, category, installAvailability, load, query, t, view]);

  const remaining = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.total - items.length);
  }, [data, items.length]);

  const preflightsByName = useMemo(
    () => new Map(preflights.map((preflight) => [preflight.fullName, preflight])),
    [preflights],
  );
  const activeCategory = data?.categories.find((definition) => definition.id === category);

  function startSearch(value: string): void {
    const nextQuery = value.trim();
    setDraft(nextQuery);
    setQuery(nextQuery);
  }

  function switchCatalogScope(nextScope: CatalogScope): void {
    setCatalogScope(nextScope);
    setView(nextScope === "plugins" ? "hot" : "total");
    setInstallAvailability("all");
    setCategory(null);
    setQuery("");
    setDraft("");
  }

  async function prepareInstall(item: CatalogItem): Promise<void> {
    setInstallActivityOpen(false);
    setPreparing(item.fullName);
    setError(null);
    setNotice(null);
    try {
      const preflight = await readJson<InstallPreflight>("/dsh-top100/install-preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: item.fullName }),
      });
      setPreflights([preflight]);
      setRiskAccepted(!preflight.requiresExplicitApproval);
      setConfirming([item]);
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreparing(null);
    }
  }

  async function install(selectedItems: CatalogItem[]): Promise<void> {
    setConfirming(null);
    setNotice(null);
    setError(null);
    try {
      const result = await readJson<InstallBatchSnapshot>("/dsh-top100/install-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approvals: selectedItems.map((item) => {
            const preflight = preflightsByName.get(item.fullName);
            return {
              fullName: item.fullName,
              approvalToken: preflight?.approvalToken ?? "",
              risksAccepted: preflight?.requiresExplicitApproval ? riskAccepted : true,
            };
          }),
        }),
      });
      setBatch(result);
      setBusy(result.batchId);
      rememberBatch(result.batchId);
      setInstallActivityOpen(true);
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreflights([]);
      setRiskAccepted(false);
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    try {
      await readJson("/dsh-top100/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
    } catch (cause) {
      setErrorAction("install");
      setError(`${t("cancelFailed")} ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async function retryJob(job: InstallJobSnapshot): Promise<void> {
    if (!job.action || job.action === "install") {
      let item = items.find((candidate) => candidate.fullName === job.fullName);
      if (!item) {
        try {
          const result = await readJson<CatalogResponse>(`/dsh-top100/rankings?${new URLSearchParams({
            view: "total",
            category: "",
            catalogScope: "plugins",
            installAvailability: "all",
            q: job.fullName,
            offset: "0",
            limit: "20",
          })}`);
          item = result.items.find((candidate) => candidate.fullName === job.fullName);
        } catch { /* use the actionable fallback below */ }
      }
      if (item) await prepareInstall(item);
      else {
        setErrorAction("install");
        setError(t("retryReloadRequired"));
      }
      return;
    }
    try {
      const result = await readJson<InstallBatchSnapshot>("/dsh-top100/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      setBatch(result);
      setBusy(result.batchId);
      rememberBatch(result.batchId);
      setInstallActivityOpen(true);
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function jobPanel(job: InstallJobSnapshot) {
    const stage = installStage(job);
    const status = installStatus(job);
    const failed = job.phase === "failed";
    const error = failed ? presentInstallError(job.error ?? job.lastLine) : null;
    const errorKey = error ? ERROR_LOCALE_KEYS[error.kind] : null;
    const activeStage = stage.current - 1;
    const terminal = ["installed", "failed", "cancelled"].includes(job.phase);
    const stages = ["installStageCheck", "installStageDownload", "installStageApply", "installStageReady"];
    return (
      <div className={`job job-${job.phase} activation-${job.activationState}`} aria-live="polite">
        <div className="job-heading">
          <div className="job-plugin-name" title={job.fullName}>{job.fullName}</div>
          <strong>{t(`phase_${job.phase}`)}</strong>
        </div>
        {!terminal ? <>
          <div
            className="job-progress"
            role="progressbar"
            aria-label={t("installProgressLabel")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stage.percent}
            aria-valuetext={`${t("installProgressEstimate")} ${stage.current}/${stage.total}`}
          >
            <span style={{ width: `${stage.percent}%` }} />
          </div>
          <div className="job-stages" aria-hidden="true">
            {stages.map((key, index) => (
              <span
                key={key}
                className={index < activeStage
                  ? "is-complete"
                  : index === activeStage ? "is-active" : undefined}
              >
                <i />{t(key)}
              </span>
            ))}
          </div>
        </> : null}
        <p className="job-status">
          {t(status.key)}{status.count === undefined ? null : <span> · {status.count}</span>}
        </p>
        {job.phase === "installed" ? (
          <p className={`activation activation-${job.activationState}`}>{t(`activation_${job.activationState}`)}</p>
        ) : null}
        {error && errorKey ? (
          <div className="job-error-message" role="alert">
            <strong>{t(`installError_${errorKey}_title`)}</strong>
            <p>{t(`installError_${errorKey}_summary`)}</p>
            {error.packages.length > 0 ? (
              <p className="job-error-packages">
                <span>{t("installErrorPackages")}</span>
                <code>{error.packages.join(", ")}</code>
              </p>
            ) : null}
            <p className="job-error-hint">
              <span>{t("installErrorNext")}</span>
              {t(`installError_${errorKey}_hint`)}
            </p>
            <details className="job-error-details">
              <summary>{t("installErrorDetails")}</summary>
              <pre>{error.detail}</pre>
            </details>
          </div>
        ) : null}
        {!["installed", "failed", "cancelled"].includes(job.phase) ? (
          <button type="button" onClick={() => void cancelJob(job.id)}>
            {t("cancel")}
          </button>
        ) : ["failed", "cancelled"].includes(job.phase) ? (
          <button type="button" disabled={busy !== null} onClick={() => void retryJob(job)}>
            {t("retry")}
          </button>
        ) : job.phase === "installed" ? (
          <button type="button" onClick={() => { setInstallActivityOpen(false); setSection("installed"); }}>
            {t("manage")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dsh-top100">
      <header className="market-head">
        <div className="rank-mark"><RankTrustMark /></div>
        <div className="head-copy">
          <h2>{t("title")}</h2>
          <p className="lede">{t("subtitle")}</p>
          {data ? (
            <div className="meta">
              <span>
                {t("updated")} {data.snapshotDate}
              </span>
              <span>
                {t("source")} <a className="data-source" href={DSHEVAL_SITE} target="_blank" rel="noreferrer" title={data.dataUrl}>DSHEval</a>
              </span>
              <span>{data.total} {t("entries")}</span>
              <span title={data.cache.fetchedAt ? new Date(data.cache.fetchedAt).toLocaleString() : undefined}>
                {data.cache.stale ? t("cachedStale") : t("cachedFresh")} · {cacheAgeLabel(data.cache.ageMs, t)}
              </span>
              {data.cache.reason ? <span className="cache-warning">{t("cacheFallback")}: {data.cache.reason}</span> : null}
            </div>
          ) : null}
        </div>
      </header>

      <nav className="page-tabs" aria-label={t("nav")}>
        <button type="button" aria-selected={section === "rankings"} onClick={() => setSection("rankings")}>{t("rankings")}</button>
        <button type="button" aria-selected={section === "installed"} onClick={() => setSection("installed")}>{t("installedPage")}</button>
        <button type="button" aria-selected={section === "diagnostics"} onClick={() => setSection("diagnostics")}>{t("diagnostics")}</button>
      </nav>

      {section === "rankings" ? <>

      <div className="catalog-navigation" aria-label={t("catalogScope")}>
        <button
          type="button"
          className="catalog-primary"
          aria-current={catalogScope === "plugins" ? "page" : undefined}
          onClick={() => switchCatalogScope("plugins")}
        >
          <span>{t("catalogScope_plugins")}</span>
          {data?.scopeCounts ? <small>{data.scopeCounts.plugins}</small> : null}
        </button>
        <div className="catalog-explore">
          <span>{t("exploreMore")}</span>
          {AUXILIARY_CATALOG_SCOPES.map((scope) => (
          <button
            type="button"
            key={scope}
            aria-pressed={catalogScope === scope}
            title={t(`catalogScopeHint_${scope}`)}
            onClick={() => switchCatalogScope(scope)}
          >
            <span>{t(`catalogScope_${scope}`)}</span>
            {data?.scopeCounts ? <small>({data.scopeCounts[scope]})</small> : null}
          </button>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-cluster">
          <input
            type="search"
            value={draft}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") startSearch(draft);
            }}
          />
          <button type="button" className="primary" onClick={() => startSearch(draft)}>
            {t("search")}
          </button>
        </div>
        <div className="browse-controls">
          <label className="select-control">
            <span>{t("categoryFilter")}</span>
            <select
              value={category ?? ""}
              onChange={(event) => {
                const nextCategory = event.target.value as PluginCategoryId | "";
                setCategory(nextCategory || null);
                setQuery("");
                setDraft("");
              }}
            >
              <option value="">{t("allCategories")}</option>
              {data?.categories.map((definition) => (
                <option key={definition.id} value={definition.id}>{definition.label}</option>
              ))}
            </select>
          </label>
          {catalogScope === "plugins" ? (
            <label className="select-control">
              <span>{t("installAvailability")}</span>
              <select
                value={installAvailability}
                onChange={(event) => setInstallAvailability(event.target.value as InstallAvailability)}
              >
                <option value="installable">{t("installAvailability_installable")}</option>
                <option value="all">{t("installAvailability_all")}</option>
                <option value="unavailable">{t("installAvailability_unavailable")}</option>
              </select>
            </label>
          ) : null}
          <label className="select-control">
            <span>{t("sortBy")}</span>
            <select
              value={view}
              onChange={(event) => {
                setView(event.target.value as RankingView);
                setQuery("");
                setDraft("");
              }}
            >
              {(catalogScope === "plugins" ? SORT_VIEWS : ["total" as const])
                .map((id) => (
                  <option key={id} value={id}>
                    {catalogScope === "plugins" ? t(id) : t("starsSort")}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      {activeCategory ? <p className="category-description">{activeCategory.description}</p> : null}

      {data ? (
        <div className="ranking-context" aria-live="polite">
          {query ? (
            <span className="result-count search-result-count">
              {t("catalogMatches")} <strong>{data.total}</strong> {t("entries")}
              <small> · {t("showingResults")} {items.length}</small>
            </span>
          ) : (
            <span className="result-count"><strong>{items.length}</strong> / {data.total} {t("entries")}</span>
          )}
          <span className="scope-summary">{t(`catalogScopeHint_${catalogScope}`)}</span>
          {catalogScope === "plugins" ? (
            <span
              className="ranking-basis"
              title={t(rankingBasisKey(view, query))}
              aria-label={`${t(rankingBasisShortKey(view, query))}: ${t(rankingBasisKey(view, query))}`}
            >
              {t(rankingBasisShortKey(view, query))}
            </span>
          ) : null}
        </div>
      ) : null}

      {notice ? <div className="banner">{notice}</div> : null}
      {error ? (
        <div className="error">
          {t(errorAction === "install" ? "installError" : "loadError")}: {error}{" "}
          {errorAction === "load" ? (
            <button type="button" onClick={() => void load(view, query, category, catalogScope, installAvailability, 0, false)}>
              {t("retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      {batch ? (
        <div className={`install-activity-banner ${busy ? "is-active" : "is-complete"}`} role="status">
          <div>
            <strong>{batch.jobs[0] ? t(`phase_${batch.jobs[0].phase}`) : t(busy ? "installTaskRunning" : "installTaskComplete")}</strong>
            {batch.jobs[0] ? <span title={batch.jobs[0].fullName}>{batch.jobs[0].fullName}</span> : null}
          </div>
          <button type="button" onClick={() => setInstallActivityOpen(true)}>
            {t(busy ? "viewInstallProgress" : "viewInstallResult")}
          </button>
        </div>
      ) : null}
      <div className="list" aria-busy={loading} aria-label={loading && items.length === 0 ? t("loadingRankings") : undefined}>
        {loading && items.length === 0 && !error ? SKELETON_CARDS : items.map((item) => {
          const identity = presentRepositoryIdentity(item);
          const installCapability = presentInstallCapability(item);
          const rankingMetric = catalogScope === "plugins" && !query && view === "hot"
            ? { label: t("hotScore"), value: item.hotScore.toFixed(1) }
            : catalogScope === "plugins" && !query && view === "rising"
              ? { label: t("daily"), value: `+${item.dailyStars}` }
              : null;
          return (
            <article
              className="ranking-card"
              key={`${item.fullName}-${item.rank}`}
              data-rank={item.rank}
              data-trust={item.evidence.trustLevel}
            >
              <div className="card-copy">
                <div className="card-heading">
                  {catalogScope === "plugins" ? (
                    <span className="rank" aria-label={`${t("rank")} ${item.rank}`}>#{item.rank}</span>
                  ) : (
                    <span className="rank">{t(`catalogScope_${catalogScope}`)}</span>
                  )}
                  <h3>
                    <a
                      href={item.url || `https://github.com/${item.fullName}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={identity.name}
                      title={identity.name}
                    >
                      <span className="repo-name">{identity.name}</span>
                      <span className="title-arrow" aria-hidden="true">↗</span>
                    </a>
                  </h3>
                </div>
                <p className="desc">{item.descriptionZh || item.description}</p>
              </div>
              <div className="card-footer">
                <div className="facts">
                  <span className="star-fact">★ {item.stars}</span>
                  <span>{t("weekly")} {deltaLabel(item.weeklyStars)}</span>
                  {rankingMetric ? (
                    <span className="ranking-metric" title={t(rankingBasisKey(view, query))}>
                      {rankingMetric.label} <strong>{rankingMetric.value}</strong>
                    </span>
                  ) : null}
                  <span className={`capability-label capability-${installCapability.kind}`} title={t(installCapability.reasonKey)}>
                    {t(installCapability.labelKey)}
                  </span>
                </div>
                <div className="actions">
                  {item.installed ? (
                    <button type="button" className="primary" onClick={() => setSection("installed")}>
                      {t("manage")}
                    </button>
                  ) : item.installable ? (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy !== null || preparing !== null}
                      onClick={() => void prepareInstall(item)}
                    >
                      {preparing === item.fullName ? t("preflighting") : t("reviewInstall")}
                    </button>
                  ) : (
                    <a className="project-link" href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                      <span>{t("viewProject")}</span><span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!loading && items.length === 0 ? <p className="lede">{t("empty")}</p> : null}
      </div>

      {remaining > 0 ? (
        <button type="button" disabled={loading} onClick={() => void load(view, query, category, catalogScope, installAvailability, items.length, true)}>
          {t("more")} ({remaining})
        </button>
      ) : null}

      {confirming ? (
        <div
          className="mask"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dsh-top100-confirm-title"
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setConfirming(null);
            setPreflights([]);
            setRiskAccepted(false);
          }}
        >
          <div className="dialog">
            <h3 id="dsh-top100-confirm-title">{t("confirmTitle")}</h3>
            <p className="lede">{t("confirmBody")}</p>
            <div className="confirm-list">
              {confirming.map((item) => {
                const preflight = preflightsByName.get(item.fullName);
                const identity = presentRepositoryIdentity(item);
                const scriptCount = preflight?.lifecycleScripts.length ?? 0;
                const needsRestart = preflight?.risks.some((risk) => risk.code === "restart-required") ?? false;
                const sourceSummaryKey = preflight?.provenance.source === "github"
                  ? "commitLocked"
                  : preflight?.provenance.repositoryIdentity === "unavailable"
                    ? "sourceIdentityUnavailable"
                    : "sourceMatched";
                return <div className="confirm-item" key={item.fullName}>
                  <div className="confirm-project">
                    <div>
                      <strong>{identity.name}</strong>
                      <span>{identity.owner} · {t(`form_${item.evidence.formFactor}`)}</span>
                    </div>
                    <a href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                      {t("viewProject")} ↗
                    </a>
                  </div>
                  <p className="confirm-description">{item.descriptionZh || item.description}</p>
                  <div className="confirm-source">
                    <span>{t("resolvedSource")}</span>
                    <code>{preflight?.provenance.resolvedTarget ?? item.installSpec?.spec ?? "-"}</code>
                  </div>
                  <div className="confirm-summary" role="list" aria-label={t("installSummary")}>
                    <span role="listitem" data-tone={preflight?.provenance.repositoryIdentity === "unavailable" ? "warning" : "safe"}>
                      <i />{t(sourceSummaryKey)}
                    </span>
                    <span role="listitem" data-tone={scriptCount > 0 ? "warning" : "safe"}>
                      <i />{scriptCount > 0
                        ? `${t("willRunScriptsPrefix")} ${scriptCount} ${t("buildScriptsUnit")}`
                        : t("noBuildScripts")}
                    </span>
                    <span role="listitem" data-tone={needsRestart ? "warning" : "safe"}>
                      <i />{t(needsRestart ? "restartAfterInstall" : "noRestartRequired")}
                    </span>
                  </div>
                  <details className="confirm-evidence">
                    <summary>{t("viewInstallTechnicalEvidence")}</summary>
                    <div>
                      {t("requestedSource")}: <code>{preflight?.provenance.requestedTarget ?? item.installSpec?.spec ?? item.type}</code>
                    </div>
                    <div>
                      {t("resolvedSource")}: <code>{preflight?.provenance.resolvedTarget ?? "-"}</code>
                    </div>
                    {preflight?.provenance.integrity ? (
                      <div>{t("integrity")}: <code>{preflight.provenance.integrity}</code></div>
                    ) : null}
                    {preflight?.lifecycleScripts.map((script) => (
                      <div className="script-evidence" key={script.name}>
                        <span>{script.name}</span><code>{script.command}</code>
                      </div>
                    ))}
                    <ul className="risk-list">
                      {preflight?.risks.map((risk) => {
                        const presented = presentInstallRisk(risk, t);
                        return (
                          <li key={risk.code} data-severity={risk.severity}>
                            <strong>{presented.summary}</strong><span>{presented.detail}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </div>;
              })}
            </div>
            {confirming.some((item) => item.install?.needsConfig) ? (
              <p className="lede">{t("confirmNeedConfig")}</p>
            ) : null}
            <p className="confirm-caveat">{t("notSecurityReview")}</p>
            {preflights.some((value) => value.requiresExplicitApproval) ? (
              <label className="risk-approval">
                <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />
                {t("riskApproval")}
              </label>
            ) : null}
            <div className="toolbar">
              <button type="button" className="primary" disabled={!riskAccepted} onClick={() => void install(confirming)}>
                {t("confirm")}
              </button>
              <button type="button" autoFocus onClick={() => { setConfirming(null); setPreflights([]); setRiskAccepted(false); }}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </> : section === "installed" ? <ManagedPage t={t} /> : <DiagnosticsPage t={t} />}

      {batch && installActivityOpen ? (
        <div className="install-activity-mask">
          <section
            className="install-activity-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dsh-top100-install-activity-title"
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              setInstallActivityOpen(false);
            }}
          >
            <header className="install-activity-head">
              <div>
                <h3 id="dsh-top100-install-activity-title">{t("installActivityTitle")}</h3>
                <p>{t(busy ? "installActivityActiveHint" : "installActivityCompleteHint")}</p>
              </div>
              <button
                type="button"
                className="install-activity-close"
                autoFocus
                aria-label={t("closeInstallActivity")}
                onClick={() => setInstallActivityOpen(false)}
              >×</button>
            </header>
            <div className="install-activity-list">
              {batch.jobs.map((job) => <div className="install-activity-item" key={job.id}>{jobPanel(job)}</div>)}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
