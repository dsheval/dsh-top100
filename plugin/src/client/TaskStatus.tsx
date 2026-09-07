import type { TaskTracker } from "./use-task-tracker.js";
import type { Translate } from "./locales.js";
export function TaskStatus({ tracking, t }: { tracking: TaskTracker; t: Translate }) {
  const failed = tracking.history.flatMap((batch) => batch.jobs.filter((job) => job.phase === "failed" || job.phase === "cancelled" || job.activationState === "broken"));
  return <>
    {tracking.pending ? <div className="banner" role="status">
      <p>{t(tracking.pending.state === "sending" ? "submissionSending" : tracking.pending.state === "cancelling" ? "submissionCancelling" : "submissionUncertain")}</p>
      {tracking.error ? <p className="error">{tracking.error.kind === "cancel" ? t("cancelFailed") : t("taskTrackingError")} {tracking.error.message}</p> : null}
      <button type="button" onClick={tracking.retryTracking}>{t("querySubmission")}</button>{" "}
      <button type="button" onClick={() => void tracking.cancelSubmission()}>{t("cancelSubmission")}</button>
    </div> : tracking.error ? <div className="error" role="alert">
      {t(tracking.error.kind === "missing" ? "installTaskUnavailable" : tracking.error.kind === "cancel" ? "cancelFailed" : tracking.error.kind === "submission" ? "submissionRejected" : "taskTrackingError")}
      {tracking.error.kind !== "missing" ? <small>{tracking.error.message}</small> : null}{" "}
      <button type="button" onClick={tracking.retryTracking}>{t("retry")}</button>
    </div> : !tracking.ready ? <div className="banner" role="status">{t("taskRecovering")}</div> : null}
    {failed.length > 0 ? <details className="banner"><summary>{t("previousTaskErrors")}</summary>
      {failed.map((job) => <div key={job.id}><strong>{job.fullName} · {t(`phase_${job.phase}`)}</strong><p>{job.error ?? job.message ?? job.lastLine}</p></div>)}
    </details> : null}
  </>;
}
