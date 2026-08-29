import { describe, expect, it } from "vitest";
import type { InstallJobSnapshot } from "../src/shared/types.js";
import {
  installProgress,
  installStatus,
  presentInstallError,
} from "../src/client/install-presentation.js";
import { en, zh } from "../src/client/locales.js";

function job(patch: Partial<InstallJobSnapshot> = {}): InstallJobSnapshot {
  return {
    id: "job-1",
    batchId: "batch-1",
    fullName: "acme/demo",
    profile: "web",
    phase: "installing",
    lastLine: "正在写入 DSH profile",
    error: null,
    message: null,
    requiresRestart: false,
    createdAt: 1_000,
    startedAt: 2_000,
    finishedAt: null,
    cancelRequested: false,
    ...patch,
  };
}

describe("install progress presentation", () => {
  it("advances within a phase without pretending an active install is complete", () => {
    const early = installProgress(job(), 2_000);
    const later = installProgress(job(), 32_000);
    expect(early).toBeGreaterThanOrEqual(70);
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThanOrEqual(92);
    expect(installProgress(job({ phase: "installed", finishedAt: 33_000 }), 33_000)).toBe(100);
  });

  it("turns pnpm counters into a short user-facing dependency status", () => {
    expect(installStatus(job({
      lastLine: "Progress: resolved 172, reused 168, downloaded 0, added 167, done",
    }))).toEqual({ key: "installStatusDependencies", count: 167 });
  });

  it("classifies ignored build scripts and extracts the affected dependencies", () => {
    expect(presentInstallError(
      "ERR_PNPM_IGNORED_BUILDS Ignored build scripts: node-pty@1.1.0 Run pnpm approve-builds",
    )).toMatchObject({
      kind: "ignored-builds",
      packages: ["node-pty@1.1.0"],
    });
    expect(installProgress(job({
      phase: "failed",
      error: "ERR_PNPM_IGNORED_BUILDS",
      finishedAt: 33_000,
    }), 33_000)).toBe(88);
  });

  it("separates network and profile-validation failures from generic failures", () => {
    expect(presentInstallError("ERR_PNPM_META_FETCH_FAIL ECONNRESET").kind).toBe("network");
    expect(presentInstallError("插件安装后未通过 DSH 配置验证，已自动回滚").kind).toBe("profile");
    expect(presentInstallError("unexpected failure").kind).toBe("generic");
  });

  it("keeps the Chinese and English presentation dictionaries in sync", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
