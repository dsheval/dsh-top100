/** Host HTTP routes for catalog, install, and status. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DATA_URL,
  filterCatalog,
  findPublishedEntry,
  invalidateCatalog,
  isRankingView,
  loadCachedRankings,
  loadRankingView,
  loadRankings,
  normalizeDataUrl,
} from "./catalog.js";
import { cancelActive, progress, runDshPlugin, runDshProfileCheck } from "../install/dsh-cli.js";
import { queryOf, readJsonBody, sameOrigin, sendJson } from "./http.js";
import { FULL_NAME_RE, PROFILE_RE, resolveInstallSpec } from "../install/install-spec.js";
import { verifyInstallSpec } from "../install/install-verify.js";
import { allowPackageBuild } from "../install/allow-builds.js";
import { withPnpmRecovery } from "../install/pnpm-compat.js";
import {
  dropFromManifest,
  profileDir,
  readInstalled,
  readProfileManifestSnapshot,
  restoreProfileManifest,
} from "./profile.js";
import { buildDiagnosticReport } from "./diagnose.js";
import { cleanupAfterUninstall, listManagedPlugins, resolveUpdateTarget, uninstallSkill } from "./manage.js";
import { isProtectedPackage, setPackageEnabled } from "./patch-toggle.js";
import { installSkill } from "../install/skill-install.js";
import { catalogCategories, isPluginCategoryId } from "../shared/categories.js";
import type { InstallAction, InstallBatchSnapshot, InstallJobSnapshot, InstallPhase, InstallResult, ManagedKind } from "../shared/types.js";
import type { PluginHost, PluginResolvedConfig } from "./contracts.js";

const MAX_BATCH_SIZE = 20;
const MAX_SKILL_CONCURRENCY = 3;
const TERMINAL_PHASES: InstallPhase[] = ["installed", "failed", "cancelled"];

interface InstallJob extends InstallJobSnapshot {
  controller: AbortController;
}

interface BatchRecord {
  id: string;
  createdAt: number;
  jobIds: string[];
}

interface ProfileQueueItem {
  job: InstallJob;
  run: () => Promise<void>;
}

const jobs = new Map<string, InstallJob>();
const batches = new Map<string, BatchRecord>();
const profileQueues = new Map<string, ProfileQueueItem[]>();
const activeProfileJobs = new Map<string, string>();
const skillQueue: Array<() => Promise<void>> = [];
let activeSkills = 0;
let nextId = 0;

function pluginVersion(): string {
  try {
    const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: string };
    return manifest.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

async function safeLoad(config: PluginResolvedConfig) {
  return loadRankings(config.dataUrl || DEFAULT_DATA_URL);
}

function installFailure(result: InstallResult): string {
  const combined = `${result.stdout}\n${result.stderr}`;
  const pnpmErrorOffset = combined.lastIndexOf("ERR_PNPM_");
  if (pnpmErrorOffset !== -1) return combined.slice(pnpmErrorOffset).trim().slice(0, 1200);
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n").slice(-1200) || "install failed";
}

function runProfilePlugin(
  config: PluginResolvedConfig,
  args: string[],
  fullName: string,
): Promise<InstallResult> {
  return withPnpmRecovery(
    (profile, recoveredArgs) => runDshPlugin(profile, recoveredArgs, { fullName }),
    config.profile,
    args,
  );
}

function id(prefix: string): string {
  nextId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`;
}

function publicJob(job: InstallJob): InstallJobSnapshot {
  return {
    id: job.id,
    batchId: job.batchId,
    fullName: job.fullName,
    profile: job.profile,
    action: job.action,
    kind: job.kind,
    phase: job.phase,
    lastLine: job.lastLine,
    error: job.error,
    message: job.message,
    requiresRestart: job.requiresRestart,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    cancelRequested: job.cancelRequested,
  };
}

function enqueueManageJob(
  batch: BatchRecord,
  config: PluginResolvedConfig,
  action: Exclude<InstallAction, "install">,
  name: string,
  kind: ManagedKind,
): void {
  const job: InstallJob = {
    id: id("job"), batchId: batch.id, fullName: name, profile: config.profile, action, kind,
    phase: "queued", lastLine: action === "update" ? "等待更新" : "等待卸载",
    error: null, message: null, requiresRestart: false, cancelRequested: false,
    controller: new AbortController(), createdAt: Date.now(), startedAt: null, finishedAt: null,
  };
  jobs.set(job.id, job);
  batch.jobIds.push(job.id);
  if (kind === "skill") {
    void (async () => {
      try {
        if (action !== "uninstall") throw new Error("Skill 不支持从排行页更新");
        updateJob(job, "installing", { lastLine: "正在移除 Skill" });
        uninstallSkill(name);
        updateJob(job, "installed", { message: "uninstalled", requiresRestart: false, lastLine: "已卸载" });
      } catch (error) { failJob(job, error); }
    })();
    return;
  }
  updateJob(job, "waiting-profile-lock", { lastLine: "等待 profile 安装队列" });
  enqueueProfile(config.profile, job, async () => {
    if (job.cancelRequested) { updateJob(job, "cancelled"); return; }
    updateJob(job, "installing", { lastLine: action === "update" ? "正在更新插件" : "正在卸载插件" });
    const timer = setInterval(() => {
      if (progress.fullName === job.fullName && progress.lastLine) job.lastLine = progress.lastLine;
    }, 250);
    timer.unref?.();
    try {
      const spec = readInstalled(config.profile)[name];
      if (!spec) throw new Error("plugin is not installed");
      if (isProtectedPackage(name)) throw new Error("该插件属于宿主或本排行插件，不能在这里管理");
      const target = action === "update" ? resolveUpdateTarget(name, spec) : name;
      if (!target) throw new Error("本地 link/file 插件请在源码目录更新");
      const manifestBefore = action === "update" ? readProfileManifestSnapshot(config.profile) : null;
      const result = await runProfilePlugin(config, [action === "update" ? "add" : "remove", target], name);
      const failed = result.exitCode !== 0 || result.timedOut || result.cancelled;
      if (failed) {
        if (action === "update" && manifestBefore && !result.cancelled) {
          const restored = restoreProfileManifest(config.profile, manifestBefore);
          if (restored.length > 0) {
            const reinstall = await runProfilePlugin(config, ["install", "--no-frozen-lockfile"], name);
            if (reinstall.exitCode !== 0 || reinstall.timedOut || reinstall.cancelled) {
              throw new Error(
                `更新失败；profile 清单已回滚，但旧版本文件恢复失败：${installFailure(reinstall)}`,
              );
            }
          }
        }
        if (action === "uninstall" && !result.cancelled) {
          const installedOnDisk = existsSync(join(profileDir(config.profile), "node_modules", name, "package.json"));
          const stillDeclared = readInstalled(config.profile)[name] !== undefined;
          if (!installedOnDisk || !stillDeclared) {
            if (!installedOnDisk) dropFromManifest(config.profile, name);
            cleanupAfterUninstall(config.profile, name);
            invalidateCatalog();
            updateJob(job, "installed", {
              requiresRestart: true,
              message: "uninstalled",
              lastLine: "卸载已完成，并清理了残留配置",
            });
            return;
          }
        }
        throw new Error(installFailure(result));
      }
      if (action === "uninstall") {
        const installedOnDisk = existsSync(join(profileDir(config.profile), "node_modules", name, "package.json"));
        if (!installedOnDisk) dropFromManifest(config.profile, name);
        if (readInstalled(config.profile)[name] !== undefined) {
          throw new Error("卸载命令已结束，但插件仍在 profile 清单中");
        }
        cleanupAfterUninstall(config.profile, name);
      }
      invalidateCatalog();
      updateJob(job, "installed", { requiresRestart: true, message: action === "update" ? "updated" : "uninstalled", lastLine: action === "update" ? "更新完成" : "已卸载" });
    } catch (error) { failJob(job, error); } finally { clearInterval(timer); }
  });
}

function createManageJobs(
  config: PluginResolvedConfig,
  action: Exclude<InstallAction, "install">,
  items: Array<{ name: string; kind: ManagedKind }>,
): InstallBatchSnapshot {
  const batchId = id("batch");
  const batch: BatchRecord = { id: batchId, createdAt: Date.now(), jobIds: [] };
  batches.set(batchId, batch);
  for (const item of items) enqueueManageJob(batch, config, action, item.name, item.kind);
  return batchSnapshot(batchId) as InstallBatchSnapshot;
}

function batchSnapshot(batchId: string): InstallBatchSnapshot | null {
  const batch = batches.get(batchId);
  if (!batch) return null;
  const batchJobs = batch.jobIds.map((jobId) => jobs.get(jobId)).filter((job): job is InstallJob => Boolean(job)).map(publicJob);
  return {
    batchId,
    createdAt: batch.createdAt,
    jobs: batchJobs,
    completed: batchJobs.filter((job) => TERMINAL_PHASES.includes(job.phase)).length,
    total: batchJobs.length,
    requiresRestart: batchJobs.some((job) => job.phase === "installed" && job.requiresRestart),
  };
}

function updateJob(job: InstallJob, phase: InstallPhase, patch: Partial<InstallJob> = {}): void {
  job.phase = phase;
  Object.assign(job, patch);
  if (job.startedAt === null && !["queued", "waiting-profile-lock"].includes(phase)) {
    job.startedAt = Date.now();
  }
  if (TERMINAL_PHASES.includes(phase)) job.finishedAt = Date.now();
}

function failJob(job: InstallJob, error: unknown): void {
  updateJob(job, job.cancelRequested ? "cancelled" : "failed", {
    error: error instanceof Error ? error.message : String(error),
  });
}

function pumpProfile(profile: string): void {
  if (activeProfileJobs.has(profile)) return;
  const queue = profileQueues.get(profile);
  const next = queue?.shift();
  if (!next) {
    profileQueues.delete(profile);
    return;
  }
  activeProfileJobs.set(profile, next.job.id);
  void next.run().finally(() => {
    activeProfileJobs.delete(profile);
    pumpProfile(profile);
  });
}

function enqueueProfile(profile: string, job: InstallJob, run: () => Promise<void>): void {
  const queue = profileQueues.get(profile) ?? [];
  queue.push({ job, run });
  profileQueues.set(profile, queue);
  pumpProfile(profile);
}

function pumpSkills(): void {
  while (activeSkills < MAX_SKILL_CONCURRENCY && skillQueue.length > 0) {
    const next = skillQueue.shift();
    if (!next) return;
    activeSkills += 1;
    void next().finally(() => {
      activeSkills -= 1;
      pumpSkills();
    });
  }
}

function enqueueSkill(run: () => Promise<void>): void {
  skillQueue.push(run);
  pumpSkills();
}

function alreadyInstalled(entry: { fullName: string }, spec: string, profile: string): boolean {
  return Object.entries(readInstalled(profile)).some(([name, value]) => {
    const haystack = `${name} ${value}`.toLowerCase();
    return haystack.includes(entry.fullName.toLowerCase()) || haystack.includes(spec.toLowerCase());
  });
}

async function prepareJob(job: InstallJob, config: PluginResolvedConfig): Promise<void> {
  try {
    if (job.cancelRequested) {
      updateJob(job, "cancelled");
      return;
    }
    updateJob(job, "validating", { lastLine: "正在验证安装源" });
    const dataUrl = config.dataUrl || DEFAULT_DATA_URL;
    const entry = await findPublishedEntry(dataUrl, job.fullName);
    if (!entry) throw new Error("plugin is not in the published catalog");
    if (entry.type?.toLowerCase() === "skill") {
      updateJob(job, "queued", { lastLine: "等待 Skill 下载队列" });
      enqueueSkill(async () => {
        if (job.cancelRequested) {
          updateJob(job, "cancelled");
          return;
        }
        try {
          updateJob(job, "downloading", { lastLine: "正在下载并验证 Skill" });
          const skills = await installSkill(entry.fullName, { signal: job.controller.signal });
          if (job.cancelRequested) {
            updateJob(job, "cancelled");
            return;
          }
          updateJob(job, "installed", {
            message: `已安装 Skill：${skills.map((item) => item.name).join("、")}`,
            requiresRestart: false,
            lastLine: "安装完成",
          });
        } catch (error) {
          failJob(job, error);
        }
      });
      return;
    }
    const spec = resolveInstallSpec(entry);
    if (!spec) throw new Error("this catalog entry has no trusted DSH install source");
    let target = spec.spec;
    let buildPackageName: string | null = null;
    const resolvedTarget = await verifyInstallSpec(spec);
    target = resolvedTarget.target;
    if (resolvedTarget.needsBuildApproval) {
      if (!resolvedTarget.packageName) throw new Error("插件需要构建，但 package.json 缺少 name");
      buildPackageName = resolvedTarget.packageName;
    }
    if (alreadyInstalled(entry, spec.spec, config.profile)) {
      updateJob(job, "installed", {
        message: "already installed",
        requiresRestart: false,
        lastLine: "已安装",
      });
      return;
    }
    updateJob(job, "waiting-profile-lock", { lastLine: "等待 profile 安装队列" });
    enqueueProfile(config.profile, job, async () => {
      if (job.cancelRequested) {
        updateJob(job, "cancelled");
        return;
      }
      updateJob(job, "installing", { lastLine: "正在写入 DSH profile" });
      const progressTimer = setInterval(() => {
        if (progress.fullName === job.fullName && progress.lastLine) job.lastLine = progress.lastLine;
      }, 250);
      progressTimer.unref?.();
      try {
        job.lastLine = "正在检查当前 DSH profile";
        const before = await runDshProfileCheck(config.profile);
        if (before.exitCode !== 0 || before.timedOut) {
          throw new Error(`当前 DSH profile 已存在配置问题，安装已停止：${installFailure(before)}`);
        }
        if (job.cancelRequested) {
          updateJob(job, "cancelled", { lastLine: "已取消" });
          return;
        }
        if (buildPackageName) allowPackageBuild(config.profile, buildPackageName);
        job.lastLine = "正在写入 DSH profile";
        const manifestBefore = readProfileManifestSnapshot(config.profile);
        const result = await runProfilePlugin(config, ["add", target], job.fullName);
        const ok = result.exitCode === 0 && !result.timedOut && !result.cancelled;
        if (!ok) {
          if (!result.cancelled) restoreProfileManifest(config.profile, manifestBefore);
          throw new Error(installFailure(result));
        }
        job.lastLine = "正在验证安装后的 DSH 配置";
        const after = await runDshProfileCheck(config.profile);
        if (after.exitCode !== 0 || after.timedOut) {
          const packageName = resolvedTarget.packageName;
          const rollback = packageName
            ? await runProfilePlugin(config, ["remove", packageName], job.fullName)
            : null;
          restoreProfileManifest(config.profile, manifestBefore);
          const rolledBack = rollback !== null
            && rollback.exitCode === 0
            && !rollback.timedOut
            && !rollback.cancelled;
          throw new Error(
            `插件安装后未通过 DSH 配置验证${rolledBack ? "，已自动回滚" : "，自动回滚失败，请手动移除"}：${installFailure(after)}`,
          );
        }
        invalidateCatalog();
        updateJob(job, "installed", {
          requiresRestart: true,
          message: "installed",
          lastLine: "安装完成",
        });
      } catch (error) {
        failJob(job, error);
      } finally {
        clearInterval(progressTimer);
      }
    });
  } catch (error) {
    failJob(job, error);
  }
}

function createBatch(fullNames: string[], config: PluginResolvedConfig): InstallBatchSnapshot {
  const batchId = id("batch");
  const batch: BatchRecord = { id: batchId, createdAt: Date.now(), jobIds: [] };
  batches.set(batchId, batch);
  for (const fullName of [...new Set(fullNames)]) {
    const job: InstallJob = {
      id: id("job"),
      batchId,
      fullName,
      profile: config.profile,
      phase: "queued",
      lastLine: "等待验证",
      error: null,
      message: null,
      requiresRestart: false,
      cancelRequested: false,
      controller: new AbortController(),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    jobs.set(job.id, job);
    batch.jobIds.push(job.id);
    void prepareJob(job, config);
  }
  return batchSnapshot(batchId) as InstallBatchSnapshot;
}

function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || TERMINAL_PHASES.includes(job.phase)) return false;
  job.cancelRequested = true;
  job.controller.abort();
  job.lastLine = "正在取消";
  if (job.phase === "installing" && activeProfileJobs.get(job.profile) === job.id) return cancelActive();
  if (["queued", "waiting-profile-lock"].includes(job.phase)) updateJob(job, "cancelled");
  return true;
}

function readBodyRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === "object" ? body as Record<string, unknown> : {};
}

export function mountRoutes(host: PluginHost, config: PluginResolvedConfig): () => void {
  const disposers = [
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/status",
      handler(_request, response) {
        sendJson(response, 200, {
          ok: true,
          name: "dsh-top100",
          version: pluginVersion(),
          dataUrl: config.dataUrl,
          profile: config.profile,
          progress,
          activeJobs: [...jobs.values()]
            .filter((job) => !TERMINAL_PHASES.includes(job.phase))
            .map(publicJob),
        });
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/progress",
      handler(_request, response) {
        sendJson(response, 200, progress);
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/installed",
      handler(_request, response) {
        sendJson(response, 200, { installed: readInstalled(config.profile) });
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/rankings",
      async handler(request, response) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const query = queryOf(request);
        const requestedView = query.get("view");
        const view = isRankingView(requestedView) ? requestedView : "hot";
        const requestedCategory = query.get("category");
        const category = view === "category" && isPluginCategoryId(requestedCategory)
          ? requestedCategory
          : view === "category" ? "ai" : null;
        const q = (query.get("q") ?? "").trim();
        const excludeSkills = query.get("skills") === "0";
        const offset = Math.max(0, Number(query.get("offset") ?? 0) || 0);
        const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 40) || 40));
        try {
          const document = q === "" && (view === "hot" || view === "rising")
            ? await loadRankingView(config.dataUrl || DEFAULT_DATA_URL, view)
            : await safeLoad(config);
          const installed = readInstalled(config.profile);
          const { total, items } = filterCatalog(document, {
            view,
            category,
            query: q,
            offset,
            limit,
            installed,
            excludeSkills,
          });
          sendJson(response, 200, {
            view,
            category,
            categories: catalogCategories(document),
            generatedAt: document.generatedAt,
            snapshotDate: document.snapshotDate,
            dataUrl: normalizeDataUrl(config.dataUrl || DEFAULT_DATA_URL),
            query: q,
            excludeSkills,
            total,
            offset,
            limit,
            items,
          });
        } catch (error) {
          sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/install-jobs",
      handler(request, response) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "method not allowed" });
          return;
        }
        const batchId = queryOf(request).get("batchId") ?? "";
        const snapshot = batchSnapshot(batchId);
        sendJson(response, snapshot ? 200 : 404, snapshot ?? { error: "batch not found" });
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/cancel",
      async handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) {
          sendJson(response, 403, { error: "same-origin POST required" });
          return;
        }
        try {
          const body = readBodyRecord(await readJsonBody(request));
          const jobId = typeof body.jobId === "string" ? body.jobId : "";
          sendJson(response, 200, { cancelled: jobId ? cancelJob(jobId) : cancelActive() });
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
        }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/install-batch",
      async handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) {
          sendJson(response, 403, { error: "same-origin POST required" });
          return;
        }
        if (!PROFILE_RE.test(config.profile)) {
          sendJson(response, 500, { error: "invalid profile name" });
          return;
        }
        try {
          const body = readBodyRecord(await readJsonBody(request));
          const requested = Array.isArray(body.fullNames) ? body.fullNames : [];
          const fullNames = requested
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim());
          if (fullNames.length === 0 || fullNames.length > MAX_BATCH_SIZE || fullNames.some((value) => !FULL_NAME_RE.test(value))) {
            sendJson(response, 400, { error: `fullNames must contain 1-${MAX_BATCH_SIZE} owner/repo values` });
            return;
          }
          sendJson(response, 202, createBatch(fullNames, config));
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
        }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/retry",
      async handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) {
          sendJson(response, 403, { error: "same-origin POST required" });
          return;
        }
        try {
          const body = readBodyRecord(await readJsonBody(request));
          const previous = typeof body.jobId === "string" ? jobs.get(body.jobId) : null;
          if (!previous || !["failed", "cancelled"].includes(previous.phase)) {
            sendJson(response, 409, { error: "only failed or cancelled jobs can be retried" });
            return;
          }
          if (previous.action === "update" || previous.action === "uninstall") {
            sendJson(response, 202, createManageJobs(config, previous.action, [{
              name: previous.fullName,
              kind: previous.kind === "skill" ? "skill" : "bundle",
            }]));
            return;
          }
          sendJson(response, 202, createBatch([previous.fullName], config));
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
        }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/cancel-all",
      handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) {
          sendJson(response, 403, { error: "same-origin POST required" });
          return;
        }
        let cancelled = 0;
        for (const job of jobs.values()) {
          if (cancelJob(job.id)) cancelled += 1;
        }
        sendJson(response, 200, { cancelled });
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/managed",
      async handler(request, response) {
        if (request.method !== "GET") { sendJson(response, 405, { error: "method not allowed" }); return; }
        const q = (queryOf(request).get("q") ?? "").trim().toLowerCase();
        try {
          const dataUrl = config.dataUrl || DEFAULT_DATA_URL;
          const document = await loadCachedRankings(dataUrl);
          // Populate or refresh the full catalog for later searches without delaying local management.
          void safeLoad(config).catch(() => undefined);
          const items = (await listManagedPlugins(config.profile, document)).filter((item) => {
            return !q || `${item.name} ${item.description} ${item.descriptionZh} ${item.fullName ?? ""}`.toLowerCase().includes(q);
          });
          sendJson(response, 200, { profile: config.profile, query: q, total: items.length, items });
        } catch (error) { sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) }); }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/toggle",
      async handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) { sendJson(response, 403, { error: "same-origin POST required" }); return; }
        try {
          const body = readBodyRecord(await readJsonBody(request));
          const name = typeof body.name === "string" ? body.name.trim() : "";
          const enabled = body.enabled === true;
          if (!name) { sendJson(response, 400, { error: "name is required" }); return; }
          if (readInstalled(config.profile)[name] === undefined) { sendJson(response, 404, { error: "plugin is not installed" }); return; }
          const result = setPackageEnabled(config.profile, name, enabled);
          sendJson(response, result.ok ? 200 : 400, { ok: result.ok, name, enabled, rows: result.rows, error: result.reason, requiresRestart: result.ok });
        } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" }); }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/manage",
      async handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) { sendJson(response, 403, { error: "same-origin POST required" }); return; }
        if (!PROFILE_RE.test(config.profile)) { sendJson(response, 500, { error: "invalid profile name" }); return; }
        try {
          const body = readBodyRecord(await readJsonBody(request));
          const action = body.action === "update" || body.action === "uninstall" ? body.action : null;
          const names = Array.isArray(body.names)
            ? body.names.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
            : typeof body.name === "string" && body.name.trim() ? [body.name.trim()] : [];
          const unique = [...new Set(names)];
          const kind: ManagedKind = body.kind === "skill" ? "skill" : "bundle";
          if (!action || unique.length === 0 || unique.length > MAX_BATCH_SIZE) { sendJson(response, 400, { error: `action and 1-${MAX_BATCH_SIZE} names are required` }); return; }
          if (kind === "skill" && action !== "uninstall") { sendJson(response, 400, { error: "Skill 不支持从排行页更新" }); return; }
          if (kind === "bundle") {
            const installed = readInstalled(config.profile);
            for (const name of unique) {
              const spec = installed[name];
              if (spec === undefined) { sendJson(response, 404, { error: "plugin is not installed" }); return; }
              if (isProtectedPackage(name)) { sendJson(response, 403, { error: "该插件属于宿主或本排行插件，不能在这里管理" }); return; }
              if (action === "update" && !resolveUpdateTarget(name, spec)) { sendJson(response, 400, { error: "本地 link/file 插件请在源码目录更新" }); return; }
            }
          }
          sendJson(response, 202, createManageJobs(config, action, unique.map((name) => ({ name, kind }))));
        } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" }); }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/diagnose",
      async handler(request, response) {
        if (request.method !== "GET") { sendJson(response, 405, { error: "method not allowed" }); return; }
        try {
          sendJson(response, 200, await buildDiagnosticReport(config.profile, { dataUrl: config.dataUrl || DEFAULT_DATA_URL }));
        } catch (error) { sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) }); }
      },
    }),
    host.webServer.register({
      kind: "exact",
      path: "/dsh-top100/install",
      async handler(request, response) {
        if (request.method !== "POST" || !sameOrigin(request)) {
          sendJson(response, 403, { error: "same-origin POST required" });
          return;
        }
        if (!PROFILE_RE.test(config.profile)) {
          sendJson(response, 500, { error: "invalid profile name" });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
          return;
        }
        const record = readBodyRecord(body);
        const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
        if (!FULL_NAME_RE.test(fullName)) {
          sendJson(response, 400, { error: "fullName must be owner/repo" });
          return;
        }
        try {
          const snapshot = createBatch([fullName], config);
          sendJson(response, 202, {
            ok: true,
            ...snapshot,
          });
        } catch (error) {
          sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),
  ];

  return () => {
    for (const dispose of disposers) dispose();
  };
}
