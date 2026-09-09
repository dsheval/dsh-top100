import type { UpdatePreflightIssue } from "../shared/types.js";
import type { Translate } from "./locales.js";

export function UpdateCheckResults({ issues, t }: { issues: UpdatePreflightIssue[]; t: Translate }) {
  return <>{issues.map((issue) => <div key={issue.name}>
    <p>{issue.name} · {t(issue.status === "current" ? "noUpdateAvailable" : "updateCheckFailed")}
      {t("descriptionLocale") === "en" ? ` · ${t(issue.status === "current" ? "updateIssueCurrent" : issue.code === "update-strategy-required" ? "updateIssueStrategy" : "updateIssueFailed")}` : ` · ${issue.message}`}
    </p>
    {t("descriptionLocale") === "en" ? <details><summary>{t("updateCheckDetails")}</summary><p>{issue.message}</p></details> : null}
  </div>)}</>;
}
