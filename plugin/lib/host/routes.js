/** Host HTTP routes for catalog, install, and status. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATA_URL, filterCatalog, findEntry, invalidateCatalog, isRankingView, loadRankings, normalizeDataUrl, } from "./catalog.js";
import { cancelActive, progress, runDshPlugin } from "../install/dsh-cli.js";
import { queryOf, readJsonBody, sameOrigin, sendJson } from "./http.js";
import { FULL_NAME_RE, PROFILE_RE, isCordisEntry, resolveInstallSpec } from "../install/install-spec.js";
import { InstallVerificationError, verifyInstallSpec } from "../install/install-verify.js";
import { allowPackageBuild } from "../install/allow-builds.js";
import { readInstalled } from "./profile.js";
import { installSkill } from "../install/skill-install.js";
import { catalogCategories, isPluginCategoryId } from "../shared/categories.js";
const MAX_BATCH_SIZE = 20;
const MAX_SKILL_CONCURRENCY = 3;
const TERMINAL_PHASES = ["installed", "failed", "cancelled"];
const jobs = new Map();
const batches = new Map();
const profileQueues = new Map();
const activeProfileJobs = new Map();
const skillQueue = [];
let activeSkills = 0;
let nextId = 0;
function pluginVersion() {
    try {
        const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        return manifest.version ?? "0.1.0";
    }
    catch {
        return "0.1.0";
    }
}
async function safeLoad(config) {
    return loadRankings(config.dataUrl || DEFAULT_DATA_URL);
}
function installFailure(result) {
    const combined = `${result.stdout}\n${result.stderr}`;
    const pnpmError = combined.match(/\[ERR_PNPM_[A-Z0-9_]+\][\s\S]*?(?=\n\n|$)/);
    if (pnpmError)
        return pnpmError[0].trim().slice(-1200);
    return result.stderr.trim().slice(-800) || result.stdout.trim().slice(-800) || "install failed";
}
function id(prefix) {
    nextId += 1;
    return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`;
}
function publicJob(job) {
    return {
        id: job.id,
        batchId: job.batchId,
        fullName: job.fullName,
        profile: job.profile,
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
function batchSnapshot(batchId) {
    const batch = batches.get(batchId);
    if (!batch)
        return null;
    const batchJobs = batch.jobIds.map((jobId) => jobs.get(jobId)).filter((job) => Boolean(job)).map(publicJob);
    return {
        batchId,
        createdAt: batch.createdAt,
        jobs: batchJobs,
        completed: batchJobs.filter((job) => TERMINAL_PHASES.includes(job.phase)).length,
        total: batchJobs.length,
        requiresRestart: batchJobs.some((job) => job.phase === "installed" && job.requiresRestart),
    };
}
function updateJob(job, phase, patch = {}) {
    job.phase = phase;
    Object.assign(job, patch);
    if (job.startedAt === null && !["queued", "waiting-profile-lock"].includes(phase)) {
        job.startedAt = Date.now();
    }
    if (TERMINAL_PHASES.includes(phase))
        job.finishedAt = Date.now();
}
function failJob(job, error) {
    updateJob(job, job.cancelRequested ? "cancelled" : "failed", {
        error: error instanceof Error ? error.message : String(error),
    });
}
function pumpProfile(profile) {
    if (activeProfileJobs.has(profile))
        return;
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
function enqueueProfile(profile, job, run) {
    const queue = profileQueues.get(profile) ?? [];
    queue.push({ job, run });
    profileQueues.set(profile, queue);
    pumpProfile(profile);
}
function pumpSkills() {
    while (activeSkills < MAX_SKILL_CONCURRENCY && skillQueue.length > 0) {
        const next = skillQueue.shift();
        if (!next)
            return;
        activeSkills += 1;
        void next().finally(() => {
            activeSkills -= 1;
            pumpSkills();
        });
    }
}
function enqueueSkill(run) {
    skillQueue.push(run);
    pumpSkills();
}
function alreadyInstalled(entry, spec, profile) {
    return Object.entries(readInstalled(profile)).some(([name, value]) => {
        const haystack = `${name} ${value}`.toLowerCase();
        return haystack.includes(entry.fullName.toLowerCase()) || haystack.includes(spec.toLowerCase());
    });
}
async function prepareJob(job, config) {
    try {
        if (job.cancelRequested) {
            updateJob(job, "cancelled");
            return;
        }
        updateJob(job, "validating", { lastLine: "正在验证安装源" });
        const document = await safeLoad(config);
        const entry = findEntry(document, job.fullName);
        if (!entry)
            throw new Error("plugin is not in the published catalog");
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
                }
                catch (error) {
                    failJob(job, error);
                }
            });
            return;
        }
        const spec = resolveInstallSpec(entry);
        if (!spec)
            throw new Error("this catalog entry has no trusted DSH install source");
        let target = spec.spec;
        let buildPackageName = null;
        try {
            const resolvedTarget = await verifyInstallSpec(spec);
            target = resolvedTarget.target;
            if (resolvedTarget.needsBuildApproval) {
                if (!resolvedTarget.packageName)
                    throw new Error("Git 插件需要构建，但 package.json 缺少 name");
                buildPackageName = resolvedTarget.packageName;
            }
        }
        catch (error) {
            if (!isCordisEntry(entry) || (error instanceof InstallVerificationError && error.fatal))
                throw error;
            job.lastLine = `宽松验证：${error instanceof Error ? error.message : "未验证安装源"}`;
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
                if (progress.fullName === job.fullName && progress.lastLine)
                    job.lastLine = progress.lastLine;
            }, 250);
            progressTimer.unref?.();
            try {
                if (buildPackageName)
                    allowPackageBuild(config.profile, buildPackageName);
                const result = await runDshPlugin(config.profile, ["add", target], { fullName: job.fullName });
                const ok = result.exitCode === 0 && !result.timedOut && !result.cancelled;
                if (!ok)
                    throw new Error(installFailure(result));
                invalidateCatalog();
                updateJob(job, "installed", {
                    requiresRestart: true,
                    message: "installed",
                    lastLine: "安装完成",
                });
            }
            catch (error) {
                failJob(job, error);
            }
            finally {
                clearInterval(progressTimer);
            }
        });
    }
    catch (error) {
        failJob(job, error);
    }
}
function createBatch(fullNames, config) {
    const batchId = id("batch");
    const batch = { id: batchId, createdAt: Date.now(), jobIds: [] };
    batches.set(batchId, batch);
    for (const fullName of [...new Set(fullNames)]) {
        const job = {
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
    return batchSnapshot(batchId);
}
function cancelJob(jobId) {
    const job = jobs.get(jobId);
    if (!job || TERMINAL_PHASES.includes(job.phase))
        return false;
    job.cancelRequested = true;
    job.controller.abort();
    job.lastLine = "正在取消";
    if (job.phase === "installing" && activeProfileJobs.get(job.profile) === job.id)
        return cancelActive();
    if (["queued", "waiting-profile-lock"].includes(job.phase))
        updateJob(job, "cancelled");
    return true;
}
function readBodyRecord(body) {
    return body !== null && typeof body === "object" ? body : {};
}
export function mountRoutes(host, config) {
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
                const offset = Math.max(0, Number(query.get("offset") ?? 0) || 0);
                const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 40) || 40));
                try {
                    const document = await safeLoad(config);
                    const installed = readInstalled(config.profile);
                    const { total, items } = filterCatalog(document, {
                        view,
                        category,
                        query: q,
                        offset,
                        limit,
                        installed,
                    });
                    sendJson(response, 200, {
                        view,
                        category,
                        categories: catalogCategories(document),
                        generatedAt: document.generatedAt,
                        snapshotDate: document.snapshotDate,
                        dataUrl: normalizeDataUrl(config.dataUrl || DEFAULT_DATA_URL),
                        query: q,
                        total,
                        offset,
                        limit,
                        items,
                    });
                }
                catch (error) {
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
                }
                catch (error) {
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
                        .filter((value) => typeof value === "string")
                        .map((value) => value.trim());
                    if (fullNames.length === 0 || fullNames.length > MAX_BATCH_SIZE || fullNames.some((value) => !FULL_NAME_RE.test(value))) {
                        sendJson(response, 400, { error: `fullNames must contain 1-${MAX_BATCH_SIZE} owner/repo values` });
                        return;
                    }
                    sendJson(response, 202, createBatch(fullNames, config));
                }
                catch (error) {
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
                    sendJson(response, 202, createBatch([previous.fullName], config));
                }
                catch (error) {
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
                    if (cancelJob(job.id))
                        cancelled += 1;
                }
                sendJson(response, 200, { cancelled });
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
                let body;
                try {
                    body = await readJsonBody(request);
                }
                catch (error) {
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
                }
                catch (error) {
                    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
    ];
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
