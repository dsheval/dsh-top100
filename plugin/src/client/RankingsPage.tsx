import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogItem,
  CatalogResponse,
  InstallBatchSnapshot,
  InstallJobSnapshot,
  InstallPreflight,
  PluginCategoryId,
  RankingView,
} from "../shared/types.js";
import type { Translate } from "./locales.js";
import { DiagnosticsPage } from "./DiagnosticsPage.js";
import {
  installProgress,
  installStatus,
  presentInstallError,
  type InstallErrorKind,
} from "./install-presentation.js";
import { ManagedPage } from "./ManagedPage.js";
import { shouldRestartPagination } from "./pagination.js";
import { presentCatalogEvidence, presentInstallRisk } from "./trust-presentation.js";

interface RankingsPageProps {
  t: Translate;
}

const VIEWS: RankingView[] = ["hot", "rising", "total", "category"];
const HIDE_SKILLS_KEY = "dsh-top100:hide-skills";
const SHOW_CANDIDATES_KEY = "dsh-top100:show-candidates";
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

function dateLabel(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : "-";
}

function FilterGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
    </svg>
  );
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

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(body.error || body.message || `${response.status} ${response.statusText}`);
  return body;
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
  const [category, setCategory] = useState<PluginCategoryId>("ai");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [hideSkills, setHideSkills] = useState(() => {
    try { return window.localStorage.getItem(HIDE_SKILLS_KEY) === "1"; } catch { return false; }
  });
  const [showCandidates, setShowCandidates] = useState(() => {
    try { return window.localStorage.getItem(SHOW_CANDIDATES_KEY) === "1"; } catch { return false; }
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<"load" | "install">("load");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CatalogItem[] | null>(null);
  const [preflights, setPreflights] = useState<InstallPreflight[]>([]);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [batch, setBatch] = useState<InstallBatchSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const loadedSnapshot = useRef<string | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (
    nextView: RankingView,
    nextQuery: string,
    nextCategory: PluginCategoryId,
    nextHideSkills: boolean,
    nextShowCandidates: boolean,
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
          category: nextCategory,
          skills: nextHideSkills ? "0" : "1",
          scope: nextShowCandidates ? "all" : "compatible",
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
    void load(view, query, category, hideSkills, showCandidates, 0, false);
  }, [category, hideSkills, load, query, section, showCandidates, view]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen && !selectedItem) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setFiltersOpen(false);
      setSelectedItem(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen, selectedItem]);

  useEffect(() => {
    if (!busy) return undefined;
    const refresh = (): void => {
      void readJson<InstallBatchSnapshot>(`/dsh-top100/install-jobs?batchId=${encodeURIComponent(busy)}`)
        .then(async (snapshot) => {
          setBatch(snapshot);
          if (snapshot.completed === snapshot.total) {
            setBusy(null);
            setNotice(snapshot.requiresRestart ? t("restart") : t("batchComplete"));
            await load(view, query, category, hideSkills, showCandidates, 0, false);
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
  }, [busy, category, hideSkills, load, query, showCandidates, t, view]);

  const remaining = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.total - items.length);
  }, [data, items.length]);

  const jobsByName = useMemo(
    () => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])),
    [batch],
  );
  const preflightsByName = useMemo(
    () => new Map(preflights.map((preflight) => [preflight.fullName, preflight])),
    [preflights],
  );

  const activeCategory = data?.categories.find((definition) => definition.id === category);
  const activeFilterCount = Number(hideSkills) + Number(showCandidates);
  const excludedSkillCount = data?.excludedSkillCount ?? 0;
  const selectedEvidence = selectedItem
    ? presentCatalogEvidence(selectedItem.evidence, selectedItem.installSpec?.kind ?? null, t)
    : null;

  function resetCatalogFilters(): void {
    setHideSkills(false);
    setShowCandidates(false);
    try {
      window.localStorage.removeItem(HIDE_SKILLS_KEY);
      window.localStorage.removeItem(SHOW_CANDIDATES_KEY);
    } catch { /* storage unavailable */ }
  }

  async function prepareInstall(item: CatalogItem): Promise<void> {
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
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreflights([]);
      setRiskAccepted(false);
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    await readJson("/dsh-top100/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
  }

  async function retryJob(job: InstallJobSnapshot): Promise<void> {
    if (!job.action || job.action === "install") {
      const item = items.find((candidate) => candidate.fullName === job.fullName);
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
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function jobPanel(job: InstallJobSnapshot) {
    const progress = installProgress(job);
    const status = installStatus(job);
    const failed = job.phase === "failed";
    const error = failed ? presentInstallError(job.error ?? job.lastLine) : null;
    const errorKey = error ? ERROR_LOCALE_KEYS[error.kind] : null;
    const activeStage = progress >= 100 ? 3 : progress >= 70 ? 2 : progress >= 36 ? 1 : 0;
    const stages = ["installStageCheck", "installStageDownload", "installStageApply", "installStageReady"];
    return (
      <div className={`job job-${job.phase} activation-${job.activationState}`} aria-live="polite">
        <div className="job-heading">
          <strong>{t(`phase_${job.phase}`)}</strong>
          <span>{t("installProgressEstimate")} {progress}%</span>
        </div>
        <div
          className="job-progress"
          role="progressbar"
          aria-label={t("installProgressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${t("installProgressEstimate")} ${progress}%`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="job-stages" aria-hidden="true">
          {stages.map((key, index) => (
            <span
              key={key}
              className={index < activeStage || job.phase === "installed"
                ? "is-complete"
                : index === activeStage ? "is-active" : undefined}
            >
              <i />{t(key)}
            </span>
          ))}
        </div>
        <p className="job-status">
          {t(status.key)}{status.count === undefined ? null : <span> · {status.count}</span>}
        </p>
        {job.phase === "installed" ? (
          <p className={`activation activation-${job.activationState}`}>{t(`activation_${job.activationState}`)}</p>
        ) : null}
        {job.provenance ? (
          <p className="job-provenance">
            {t("resolvedSource")} <code>{job.provenance.resolvedTarget}</code>
          </p>
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
          <button type="button" onClick={() => setSection("installed")}>
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

      <div className="toolbar">
        <div className="search-cluster">
          <input
            type="search"
            value={draft}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setQuery(draft.trim());
            }}
          />
          <button type="button" className="primary" onClick={() => setQuery(draft.trim())}>
            {t("search")}
          </button>
        </div>
        <div className="filter-control" ref={filterRef}>
          <button
            type="button"
            className="filter-trigger"
            aria-expanded={filtersOpen}
            aria-controls="dsh-top100-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <FilterGlyph />
            <span>{t("filter")}</span>
            {activeFilterCount > 0 ? <span className="filter-count">{activeFilterCount}</span> : null}
          </button>
          {filtersOpen ? (
            <div className="filter-popover" id="dsh-top100-filters" role="group" aria-label={t("filter")}>
              <p>{t("filterHint")}</p>
              <label>
                <span><strong>{t("hideSkills")}</strong><small>{t("hideSkillsHint")}</small></span>
                <input type="checkbox" checked={hideSkills} onChange={(event) => {
                  const checked = event.target.checked;
                  setHideSkills(checked);
                  try { window.localStorage.setItem(HIDE_SKILLS_KEY, checked ? "1" : "0"); } catch { /* storage unavailable */ }
                }} />
              </label>
              <label>
                <span><strong>{t("showCandidates")}</strong><small>{t("showCandidatesHint")}</small></span>
                <input type="checkbox" checked={showCandidates} onChange={(event) => {
                  const checked = event.target.checked;
                  setShowCandidates(checked);
                  try { window.localStorage.setItem(SHOW_CANDIDATES_KEY, checked ? "1" : "0"); } catch { /* storage unavailable */ }
                }} />
              </label>
              {activeFilterCount > 0 ? (
                <button type="button" className="filter-reset" onClick={resetCatalogFilters}>{t("clearFilters")}</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="tabs ranking-tabs" role="tablist">
        {VIEWS.map((id) => (
          <button key={id} type="button" className="tab" role="tab" aria-selected={view === id} onClick={() => { setView(id); setQuery(""); setDraft(""); }}>
            {t(id)}
          </button>
        ))}
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

      {data ? (
        <div className="ranking-context" aria-live="polite">
          <span className="result-count"><strong>{items.length}</strong> / {data.total} {t("entries")}</span>
          {hideSkills && excludedSkillCount > 0 ? (
            <span className="filter-summary">
              {t("hiddenSkillsPrefix")} {excludedSkillCount} {t("skillRepositories")}
            </span>
          ) : null}
          <span
            className="ranking-basis"
            title={t(rankingBasisKey(view, query))}
            aria-label={`${t(rankingBasisShortKey(view, query))}: ${t(rankingBasisKey(view, query))}`}
          >
            {t(rankingBasisShortKey(view, query))}
          </span>
        </div>
      ) : null}

      {notice ? <div className="banner">{notice}</div> : null}
      {error ? (
        <div className="error">
          {t(errorAction === "install" ? "installError" : "loadError")}: {error}{" "}
          {errorAction === "load" ? (
            <button type="button" onClick={() => void load(view, query, category, hideSkills, showCandidates, 0, false)}>
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
      <div className="list" aria-busy={loading} aria-label={loading && items.length === 0 ? t("loadingRankings") : undefined}>
        {loading && items.length === 0 && !error ? SKELETON_CARDS : items.map((item) => {
          const job = jobsByName.get(item.fullName);
          const rankingMetric = !query && view === "hot"
            ? { label: t("hotScore"), value: item.hotScore.toFixed(1) }
            : !query && view === "rising"
              ? { label: t("daily"), value: `+${item.dailyStars}` }
              : null;
          return (
            <article
              key={`${item.fullName}-${item.rank}`}
              data-rank={item.rank}
              data-trust={item.evidence.trustLevel}
            >
              <div className="rank">
                <span aria-label={`${t("rank")} ${item.rank}`}>{item.rank}</span>
              </div>
              <div className="card-copy">
                <h3>
                  <a href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                    <span>{item.fullName}</span><span className="title-arrow" aria-hidden="true">↗</span>
                  </a>
                </h3>
                <p className="desc">{item.descriptionZh || item.description}</p>
                <div className="facts">
                  <span className="star-fact">★ {item.stars}</span>
                  <span>{t("weekly")} {item.weeklyStars}</span>
                  {rankingMetric ? (
                    <span className="ranking-metric" title={t(rankingBasisKey(view, query))}>
                      {rankingMetric.label} <strong>{rankingMetric.value}</strong>
                    </span>
                  ) : null}
                  <span className={`evidence-badge evidence-${item.evidence.trustLevel}`}>{t(`trust_${item.evidence.trustLevel}`)}</span>
                </div>
              </div>
              <div className="actions">
                <button type="button" className="detail-button" onClick={() => setSelectedItem(item)}>
                  {t("viewDetails")}
                </button>
                {job ? jobPanel(job) : item.installed ? (
                  <button type="button" onClick={() => setSection("installed")}>
                    {t("manage")}
                  </button>
                ) : item.installable ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy !== null || preparing !== null}
                    onClick={() => void prepareInstall(item)}
                  >
                    {preparing === item.fullName ? t("preflighting") : t("install")}
                  </button>
                ) : (
                  <a className="project-link" href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                    <span>{t("viewProject")}</span><span aria-hidden="true">↗</span>
                  </a>
                )}
              </div>
            </article>
          );
        })}
        {!loading && items.length === 0 ? <p className="lede">{t("empty")}</p> : null}
      </div>

      {remaining > 0 ? (
        <button type="button" disabled={loading} onClick={() => void load(view, query, category, hideSkills, showCandidates, items.length, true)}>
          {t("more")} ({remaining})
        </button>
      ) : null}

      {selectedItem && selectedEvidence ? (
        <div className="detail-mask" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedItem(null);
        }}>
          <aside
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dsh-top100-detail-title"
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              setSelectedItem(null);
            }}
          >
            <div className="detail-head">
              <span className="detail-rank" aria-label={`${t("rank")} ${selectedItem.rank}`}>{selectedItem.rank}</span>
              <div>
                <h3 id="dsh-top100-detail-title">
                  <a href={selectedItem.url || `https://github.com/${selectedItem.fullName}`} target="_blank" rel="noreferrer">
                    <span>{selectedItem.fullName}</span><span className="title-arrow" aria-hidden="true">↗</span>
                  </a>
                </h3>
                <p>{t(`form_${selectedItem.evidence.formFactor}`)}</p>
              </div>
              <button type="button" className="detail-close" autoFocus aria-label={t("closeDetails")} onClick={() => setSelectedItem(null)}>×</button>
            </div>

            <p className="detail-description">{selectedItem.descriptionZh || selectedItem.description}</p>

            <dl className="detail-metrics">
              <div><dt>{t("rank")}</dt><dd>#{selectedItem.rank}</dd></div>
              <div><dt>{t("stars")}</dt><dd>{selectedItem.stars}</dd></div>
              <div><dt>{t("weekly")}</dt><dd>+{selectedItem.weeklyStars}</dd></div>
              <div><dt>{t("daily")}</dt><dd>+{selectedItem.dailyStars}</dd></div>
            </dl>

            <section className="detail-section">
              <h4>{t("rankingDetails")}</h4>
              <p>{t(rankingBasisKey(view, query))}</p>
              {!query && view === "hot" ? <p className="detail-highlight">{t("hotScore")} {selectedItem.hotScore.toFixed(1)}</p> : null}
            </section>

            <section className="detail-section">
              <h4>{t("projectDetails")}</h4>
              <dl className="detail-properties">
                <div><dt>{t("projectType")}</dt><dd>{t(`form_${selectedItem.evidence.formFactor}`)}</dd></div>
                <div><dt>{t("license")}</dt><dd>{selectedItem.license || t("notAvailable")}</dd></div>
                <div><dt>{t("lastMaintained")}</dt><dd>{dateLabel(selectedItem.pushedAt)}</dd></div>
              </dl>
            </section>

            <section className="detail-section">
              <h4>{t("trustDetails")}</h4>
              <span className={`evidence-badge evidence-${selectedItem.evidence.trustLevel}`}>{t(`trust_${selectedItem.evidence.trustLevel}`)}</span>
              <ul>{selectedEvidence.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
              <p className="detail-caveat">{selectedEvidence.caveat}</p>
            </section>

            <section className="detail-section">
              <h4>{t("installDetails")}</h4>
              {selectedItem.installable && selectedItem.installSpec ? (
                <>
                  <div className="detail-source"><span>{t("catalogInstallSource")}</span><code>{selectedItem.installSpec.spec}</code></div>
                  <p>{t("preflightNote")}</p>
                </>
              ) : (
                <p className="browse-note">{t("browseOnlyHint")}</p>
              )}
            </section>

            <div className="detail-actions">
              <a className="project-link" href={selectedItem.url || `https://github.com/${selectedItem.fullName}`} target="_blank" rel="noreferrer">
                <span>{t("viewProject")}</span><span aria-hidden="true">↗</span>
              </a>
              {selectedItem.installed ? (
                <button type="button" onClick={() => { setSelectedItem(null); setSection("installed"); }}>{t("manage")}</button>
              ) : selectedItem.installable ? (
                <button type="button" className="primary" disabled={busy !== null || preparing !== null} onClick={() => {
                  const item = selectedItem;
                  setSelectedItem(null);
                  void prepareInstall(item);
                }}>{t("install")}</button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {confirming ? (
        <div className="mask" role="dialog" aria-modal="true">
          <div className="dialog">
            <h3>{t("confirmTitle")}</h3>
            <p className="lede">{t("confirmBody")}</p>
            <div className="confirm-list">
              {confirming.map((item) => {
                const preflight = preflightsByName.get(item.fullName);
                return <div key={item.fullName}>
                  <strong>{item.fullName}</strong>
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
                </div>;
              })}
            </div>
            {confirming.some((item) => item.install?.needsConfig) ? (
              <p className="lede">{t("confirmNeedConfig")}</p>
            ) : null}
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
              <button type="button" onClick={() => { setConfirming(null); setPreflights([]); setRiskAccepted(false); }}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </> : section === "installed" ? <ManagedPage t={t} /> : <DiagnosticsPage t={t} />}
    </div>
  );
}
