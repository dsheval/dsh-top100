import { useCallback, useEffect, useState } from "react";
import type { DiagnosticFinding, DiagnosticReport } from "../shared/types.js";
import { diagnosticSummary } from "./diagnostic-export.js";
import type { Translate } from "./locales.js";

function FindingList({ items }: { items: DiagnosticFinding[] }) {
  return <div className="diag-list">{items.map((item) => <div key={`${item.code}-${item.subject}-${item.message}`} className={`diag-${item.severity}`}><strong>{item.subject}</strong> — {item.message}{item.detail ? <small>{item.detail}</small> : null}</div>)}</div>;
}

export function DiagnosticsPage({ t }: { t: Translate }) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/dsh-top100/diagnose", { cache: "no-store" });
      const body = (await response.json()) as DiagnosticReport & { error?: string };
      if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
      setReport(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className="error">{t("diagLoadFail")}: {error} <button type="button" onClick={() => void load()}>{t("retry")}</button></div>;
  if (!report) return <p className="lede">{loading ? t("diagLoading") : t("diagLoadFail")}</p>;
  function exportSummary(): void {
    if (!report) return;
    setExportError(false);
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const payload = JSON.stringify(diagnosticSummary(report), null, 2);
      url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      link = document.createElement("a");
      link.href = url;
      link.download = "dsh-top100-diagnostic-summary.json";
      document.body.appendChild(link);
      link.click();
    } catch { setExportError(true); }
    finally {
      link?.remove();
      if (url) { const objectUrl = url; setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
    }
  }
  const errors = report.findings.filter((item) => item.severity === "error");
  const warnings = report.findings.filter((item) => item.severity === "warning");
  return (
    <div className="diag-page">
      <div className="diag-summary">
        <strong className={report.summary.ok ? "diag-ok" : "diag-error"}>{report.summary.ok ? t("diagOk") : t("diagIssues")}</strong>
        <span>{t("diagErrors")}: {report.summary.errors}</span><span>{t("diagWarnings")}: {report.summary.warnings}</span>
        <span>{t("diagConflicts")}: {report.summary.conflicts}</span><span>{t("diagDeps")}: {report.summary.dependencies}</span>
        <button type="button" disabled={loading} onClick={() => void load()}>{t("diagRefresh")}</button>
        <button type="button" disabled={loading} onClick={exportSummary}>{t("diagExport")}</button>
      </div>
      <p className="lede">{t("diagExportHint")}</p>
      {exportError ? <p className="error" role="alert">{t("diagExportFailed")}</p> : null}
      <div className="diag-grid">
        <section><h3>{t("diagCatalogTitle")}</h3><p><code>{report.catalog.dataUrl}</code></p><p>{t("updated")}: {report.catalog.snapshotDate ?? "—"} · {report.catalog.counts.total} plugins</p></section>
        <section><h3>{t("diagInventory")}</h3><p>{t("diagOfficial")}: {report.inventory.official} · {t("diagCommunity")}: {report.inventory.community} · Skills: {report.inventory.skills}</p><p>{t("enabled")}: {report.inventory.enabled} · {t("disabled")}: {report.inventory.disabled}</p></section>
      </div>
      <details open={errors.length > 0}><summary>{t("diagErrors")} ({errors.length})</summary><FindingList items={errors} /></details>
      <details open={warnings.length > 0}><summary>{t("diagWarnings")} ({warnings.length})</summary><FindingList items={warnings} /></details>
      <details><summary>{t("diagBundles")} ({report.bundles.length})</summary><div className="diag-list">{report.bundles.map((item) => <div key={item.name}><strong>{item.name}</strong> · {item.version ?? "—"} · {item.enabled ? t("enabled") : t("disabled")}{item.error ? <small className="diag-error">{item.error}</small> : null}</div>)}</div></details>
      <details><summary>{t("diagSkills")} ({report.skills.length})</summary><div className="diag-list">{report.skills.map((item) => <div key={item.name}><strong>{item.name}</strong> · {item.hasManifest ? "SKILL.md ✓" : "SKILL.md ✕"}</div>)}</div></details>
      <details><summary>{t("diagPatch")}</summary><div className="diag-list"><code>{report.patch.path}</code><div>{t("disabled")}: {report.patch.disables.join(", ") || "—"}</div><div>{t("diagOrphans")}: {report.patch.orphans.join(", ") || "—"}</div></div></details>
    </div>
  );
}
