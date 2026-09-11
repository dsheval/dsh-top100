import { describe, expect, it } from "vitest";
import type { InstallJobSnapshot } from "../src/shared/types.js";
import {
  dependencyProgress,
  taskPhaseKey,
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
  it("shows all real pnpm counters including zero downloads", () => {
    const line = "Progress: resolved 172, reused 168, downloaded 0, added 167, done";
    expect(dependencyProgress(line)).toEqual({ resolved: 172, reused: 168, downloaded: 0, added: 167 });
    expect(installStatus(job({ lastLine: line }))).toEqual({ key: "taskDependencies" });
  });
  it("shows retries and does not reuse stale dependency text after failure", () => {
    const lastLine = "[WARN] GET https://registry.npmjs.org/demo error (ECONNRESET). Will retry in 1 minute. 1 retries left.";
    expect(installStatus(job({ lastLine }))).toEqual({ key: "taskNetworkRetry" });
    expect(installStatus(job({ phase: "failed", lastLine }))).toEqual({ key: "task_install_failed" });
    expect(installStatus(job({ phase: "validating", lastLine: "正在恢复安装前的依赖，请等待恢复完成" }))).toEqual({ key: "taskRecoveringDependencies" });
  });
  it.each(["install", "update", "uninstall"] as const)("uses %s wording for each terminal and mutation state", (action) => {
    for (const phase of ["installing", "installed", "failed", "cancelled"] as const) {
      expect(taskPhaseKey(job({ action, phase }))).toBe(`task_${action}_${phase}`);
      expect(zh[taskPhaseKey(job({ action, phase }))]).toBeTruthy();
      expect(en[taskPhaseKey(job({ action, phase }))]).toBeTruthy();
    }
  });

  it("classifies ignored build scripts and extracts the affected dependencies", () => {
    expect(presentInstallError(
      "ERR_PNPM_IGNORED_BUILDS Ignored build scripts: node-pty@1.1.0 Run pnpm approve-builds",
    )).toMatchObject({
      kind: "ignored-builds",
      packages: ["node-pty@1.1.0"],
    });

  });

  it("separates network and profile-validation failures from generic failures", () => {
    expect(presentInstallError("ERR_PNPM_META_FETCH_FAIL ECONNRESET").kind).toBe("network");
    expect(presentInstallError("插件安装后未通过 DSH 配置验证，已自动回滚").kind).toBe("profile");
    expect(presentInstallError("unexpected failure").kind).toBe("generic");
  });

  it("uses the final classified failure instead of earlier retry output", () => {
    const detail = "[prepare-failed] 构建失败\nERR_PNPM_META_FETCH_FAIL network\n[Top100 retry]\nERR_PNPM_PREPARE_PACKAGE";
    expect(presentInstallError(detail)).toMatchObject({ kind: "build", detail });
    expect(presentInstallError("[peer-dependency] ERR_PNPM_PEER_DEP_ISSUES").kind).toBe("peer");
    expect(presentInstallError("[release-age] minimumReleaseAge").kind).toBe("policy");
    expect(presentInstallError("UND_ERR_CONNECT_TIMEOUT").kind).toBe("timeout");
  });

  it("keeps the Chinese and English presentation dictionaries in sync", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
