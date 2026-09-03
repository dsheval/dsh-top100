import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.js";
import { en, zh } from "../src/client/locales.js";
import { visibleInstallReviewRisks } from "../src/client/install-review-presentation.js";
import type { InstallRiskEvidence } from "../src/shared/types.js";

const page = readFileSync(new URL("../src/client/RankingsPage.tsx", import.meta.url), "utf8");
const review = page.slice(page.indexOf('<div className="dialog">'), page.indexOf('</> : section === "installed"'));

describe("installation review UI safety contract", () => {
  it("uses the brand accent for the script marker without removing the warning text", () => {
    expect(css).toContain('.confirm-scripts[data-warning="true"] { border-left: 2px solid var(--t100-accent)');
    expect(review).toContain('t("confirmScripts")');
    expect(zh.confirmScripts).toContain("将执行脚本");
  });

  it("shows exact scripts and risks before the optional technical details", () => {
    const details = review.indexOf('<details className="confirm-evidence">');
    expect(details).toBeGreaterThan(0);
    const visible = review.slice(0, details);
    expect(visible).toContain("{script.command}");
    expect(visible).toContain('data-warning={scriptCount > 0}');
    expect(visible).toContain('className="risk-list"');
    expect(visible).toContain("visibleInstallReviewRisks(preflight?.risks ?? [], scriptCount)");
    expect(visible).toContain('t("confirmRestart")');
    expect(review.slice(details, review.indexOf("</details>"))).not.toContain('className="risk-list"');
  });

  it("keeps exact sources, integrity and security caveats available", () => {
    expect(review).toContain("preflight?.provenance.resolvedTarget");
    expect(review).toContain("preflight?.provenance.requestedTarget");
    expect(review).toContain("preflight.provenance.integrity");
    expect(review).toContain('t("confirmSecurityNote")');
    expect(zh.confirmSecurityNote).toContain("不等于安全审核");
    expect(en.confirmSecurityNote).toContain("not a security review");
  });

  it("does not remove explicit approval or cancellation when restyling actions", () => {
    expect(zh.reviewInstall).toBe("安装");
    expect(en.reviewInstall).toBe("Install");
    expect(review).toContain("preflights.some((value) => value.requiresExplicitApproval)");
    expect(review).toContain('checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)}');
    expect(review).toContain('disabled={!riskAccepted} onClick={() => void install(confirming)}');
    expect(review).toContain('autoFocus onClick={() => { setConfirming(null); setPreflights([]); setRiskAccepted(false); }}');
  });

  it("uses one scrollable body and keeps the decision footer outside it", () => {
    expect(review).toContain('className="confirm-body"');
    expect(review).toContain('<footer className="confirm-footer">');
    const listCss = css.slice(css.indexOf(".dsh-top100 .confirm-list {"), css.indexOf(".dsh-top100 .confirm-item {"));
    expect(listCss).not.toContain("overflow:");
    expect(listCss).not.toContain("max-height:");
    expect(css).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
  });

  it("removes repeated descriptions and moves routine source checks into details", () => {
    const visible = review.slice(0, review.indexOf('<details className="confirm-evidence">'));
    expect(visible).not.toContain("item.description");
    expect(visible).not.toContain("identity.owner");
    expect(visible).not.toContain('t("confirmBody")');
    expect(visible).not.toContain("t(sourceSummaryKey)");
    expect(visible).toContain('t("confirmProjectTitle")');
    expect(visible).toContain('className="confirm-target"');
  });
});

describe("compact installation risk presentation", () => {
  const risk = (code: InstallRiskEvidence["code"], severity: InstallRiskEvidence["severity"]): InstallRiskEvidence => ({
    code, severity, summary: code, detail: "Original evidence",
  });

  it("preserves source identity and active-content warnings", () => {
    const warnings = [risk("repository-identity", "warning"), risk("skill-content", "warning")];
    expect(visibleInstallReviewRisks(warnings, 1)).toEqual(warnings);
  });

  it("only removes duplicate lifecycle prose if script commands are shown", () => {
    const scripts = risk("lifecycle-scripts", "warning");
    expect(visibleInstallReviewRisks([scripts], 1)).toEqual([]);
    expect(visibleInstallReviewRisks([scripts], 0)).toEqual([scripts]);
  });

  it("compacts routine restart guidance without hiding a warning-level restart", () => {
    const warning = risk("restart-required", "warning");
    expect(visibleInstallReviewRisks([risk("restart-required", "info"), warning], 0)).toEqual([warning]);
  });
});
