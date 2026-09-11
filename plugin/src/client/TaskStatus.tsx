import { taskPhaseKey } from "./install-presentation.js";
import { TaskDetails } from "./TaskDetails.js";
import type { TaskTracker } from "./use-task-tracker.js";
import type { Translate } from "./locales.js";
import { isInstallBatchComplete } from "./install-batch-presentation.js";
export function TaskStatus({ tracking, t, onViewResult }: { tracking: TaskTracker; t: Translate; onViewResult?: () => void }) {
  const recent = tracking.history.flatMap((batch) => batch.jobs);
  return <>
    {tracking.pending ? <div className="banner" role="status">
      <p>{t(tracking.pending.state === "sending" ? "submissionSending" : tracking.pending.state === "cancelling" ? "submissionCancelling" : "submissionUncertain")}</p>
      {tracking.error ? <p className="error">{tracking.error.kind === "cancel" ? t("cancelFailed") : t("taskTrackingError")} {tracking.error.message}</p> : null}
      <button type="button" onClick={tracking.retryTracking}>{t("querySubmission")}</button>{" "}
      <button type="button" onClick={() => void tracking.cancelSubmission()}>{t("cancelSubmission")}</button>
    </div> : tracking.error?.kind === "missing" ? <div className="banner" role="status">
      <p>{t("installTaskUnavailable")}</p>
      <button type="button" onClick={tracking.dismissNotice}>{t("dismissTaskNotice")}</button>
    </div> : tracking.error ? <div className="error" role="alert">
      {t(tracking.error.kind === "cancel" ? "cancelFailed" : tracking.error.kind === "submission" ? "submissionRejected" : "taskTrackingError")}
      <small>{tracking.error.message}</small>{" "}
      <button type="button" onClick={tracking.retryTracking}>{t("retry")}</button>
    </div> : !tracking.ready ? <div className="banner" role="status">{t("taskRecovering")}</div> : null}
    {recent.length > 0 ? <details className="banner task-history" open><summary>{t("recentTasks")} ({recent.length})</summary>
      <div className="task-history-list">
        {recent.map((job) => <details key={job.id} className="task-history-item">
          <summary>{job.fullName} · {t(taskPhaseKey(job))}</summary>
          <TaskDetails job={job} t={t} headingPresent />
        </details>)}
      </div>
      {onViewResult && tracking.batch && !tracking.busy && isInstallBatchComplete(tracking.batch) ? <button type="button" onClick={onViewResult}>{t("viewLatestTaskResult")}</button> : null}
    </details> : null}
  </>;
}
