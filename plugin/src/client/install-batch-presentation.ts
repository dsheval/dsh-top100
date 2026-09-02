import type { InstallBatchSnapshot, InstallJobSnapshot } from "../shared/types.js";

export interface InstallBatchSummary {
  succeeded: number;
  failed: number;
  cancelled: number;
  active: number;
  restartRequired: number;
  configurationRequired: number;
}

export function isInstallBatchComplete(batch: InstallBatchSnapshot): boolean {
  return batch.completed === batch.total;
}

export function summarizeInstallBatch(batch: InstallBatchSnapshot): InstallBatchSummary {
  const summary: InstallBatchSummary = {
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    active: 0,
    restartRequired: 0,
    configurationRequired: 0,
  };
  for (const job of batch.jobs) {
    if (job.phase === "installed") summary.succeeded += 1;
    else if (job.phase === "failed") summary.failed += 1;
    else if (job.phase === "cancelled") summary.cancelled += 1;
    else summary.active += 1;
    if (job.phase === "installed" && job.requiresRestart) summary.restartRequired += 1;
    if (job.phase === "installed" && job.activationState === "configuration-required") {
      summary.configurationRequired += 1;
    }
  }
  return summary;
}

export interface InstallStagePresentation {
  current: number;
  total: 4;
  percent: number;
}

/** A deliberately coarse stage indicator; it never pretends to be byte progress. */
export function installStage(job: InstallJobSnapshot): InstallStagePresentation {
  if (job.phase === "installed") return { current: 4, total: 4, percent: 100 };
  if (job.phase === "queued" || job.phase === "validating") return { current: 1, total: 4, percent: 25 };
  if (job.phase === "downloading") return { current: 2, total: 4, percent: 50 };
  if (job.phase === "waiting-profile-lock" || job.phase === "installing") return { current: 3, total: 4, percent: 75 };
  const output = `${job.lastLine}\n${job.error ?? ""}`;
  if (/下载|fetch|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(output)) return { current: 2, total: 4, percent: 50 };
  if (/Progress:|ERR_PNPM_|写入|配置验证|profile/i.test(output)) return { current: 3, total: 4, percent: 75 };
  return { current: 1, total: 4, percent: 25 };
}
