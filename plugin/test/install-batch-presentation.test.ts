import { describe, expect, it } from "vitest";
import type { InstallBatchSnapshot, InstallJobSnapshot } from "../src/shared/types.js";
import {
  installStage,
  isInstallBatchComplete,
  summarizeInstallBatch,
} from "../src/client/install-batch-presentation.js";

function job(patch: Partial<InstallJobSnapshot>): InstallJobSnapshot {
  return {
    id: "job-1",
    batchId: "batch-1",
    fullName: "acme/demo",
    profile: "web",
    phase: "queued",
    lastLine: "",
    error: null,
    message: null,
    requiresRestart: false,
    activationState: "pending",
    provenance: null,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    cancelRequested: false,
    ...patch,
  };
}

describe("install batch presentation", () => {
  it("distinguishes active and completed batches for recovery cleanup", () => {
    const batch: InstallBatchSnapshot = {
      batchId: "batch-1",
      createdAt: 1,
      jobs: [job({ phase: "downloading" })],
      completed: 0,
      total: 1,
      requiresRestart: false,
    };

    expect(isInstallBatchComplete(batch)).toBe(false);
    expect(isInstallBatchComplete({ ...batch, completed: 1 })).toBe(true);
  });

  it("summarizes terminal outcomes instead of collapsing them into completed", () => {
    const jobs = [
      job({ id: "ok", phase: "installed", requiresRestart: true, activationState: "restart-required" }),
      job({ id: "config", phase: "installed", activationState: "configuration-required" }),
      job({ id: "failed", phase: "failed" }),
      job({ id: "cancelled", phase: "cancelled" }),
      job({ id: "active", phase: "downloading" }),
    ];
    const batch: InstallBatchSnapshot = {
      batchId: "batch-1",
      createdAt: 1,
      jobs,
      completed: 4,
      total: 5,
      requiresRestart: true,
    };
    expect(summarizeInstallBatch(batch)).toEqual({
      succeeded: 2,
      failed: 1,
      cancelled: 1,
      active: 1,
      restartRequired: 1,
      configurationRequired: 1,
    });
  });

  it("uses four coarse stages rather than simulated percentages", () => {
    expect(installStage(job({ phase: "validating" }))).toEqual({ current: 1, total: 4, percent: 25 });
    expect(installStage(job({ phase: "downloading" }))).toEqual({ current: 2, total: 4, percent: 50 });
    expect(installStage(job({ phase: "installing" }))).toEqual({ current: 3, total: 4, percent: 75 });
    expect(installStage(job({ phase: "installed" }))).toEqual({ current: 4, total: 4, percent: 100 });
  });
});
