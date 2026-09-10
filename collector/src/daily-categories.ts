/** Source-bound daily classification jobs; no network or persistence during planning. */
import type { DshPlugin, PluginCategoryAssignment } from "@dsh-top100/schema";
import {
  CATEGORY_POLICY_VERSION, bindCategoryAssignments, currentCategoryAssignments,
  fallbackCategoryAssignments, hasAuthoritativeCategories, normalizeCategorySuggestions,
  toDeepSeekAssignments, type CategoryInput, type CategorySuggestion,
} from "./categories.js";
import { reviewedCategories } from "./editorial.js";
import { contentSourceHash, hasContentEvidence, matchingEditorialHold, nextContentAttemptAt,
  type ContentSource } from "./content-source.js";
import { classifyWithDeepSeek, type DeepSeekRequestOptions } from "./llm.js";

export interface DailyCategoryInput extends ContentSource {
  fullName: string;
  name: string;
  stars: number;
  categories?: PluginCategoryAssignment[];
}
export interface DailyCategoryJob {
  sourceHash: string;
  policyVersion: number;
  status: "pending" | "retry" | "missing-source" | "review-required" | "complete";
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  failure?: "request-failed" | "empty-or-invalid-result";
  reviewReason?: string;
  categories?: PluginCategoryAssignment[];
}
export interface DailyCategoryState { schemaVersion: 1; jobs: Record<string, DailyCategoryJob>; }
export interface DailyCategoryCache { sourceHash: string; categories: PluginCategoryAssignment[]; }
export interface DailyCategoryTask { fullName: string; entry: DailyCategoryInput; job: DailyCategoryJob; }
export interface DailyCategoryPlan { state: DailyCategoryState; ready: DailyCategoryTask[]; }

function categoryInput(entry: DailyCategoryInput): CategoryInput {
  return { ...entry, description: entry.description ?? "", install: entry.install ?? undefined };
}

/** Migrate a previous full source, never an identity-incomplete legacy cache row. */
export function carryForwardDailyCategories(sources: DshPlugin[], previousSources: Map<string, DshPlugin>): void {
  for (const entry of sources) {
    const previous = previousSources.get(entry.fullName.toLowerCase());
    const sameSource = previous && contentSourceHash(previous, "categories") === contentSourceHash(entry, "categories");
    if (previous && !sameSource && previous.categories
      && JSON.stringify(entry.categories) === JSON.stringify(previous.categories)) entry.categories = [];
    if (hasAuthoritativeCategories(currentCategoryAssignments(categoryInput(entry), entry.categories))) continue;
    if (!previous || !sameSource) continue;
    // A full unchanged market source is existing content, including while held.
    // Incomplete derived-cache replay remains gated separately in the planner.
    const current = currentCategoryAssignments(categoryInput(entry), previous.categories);
    if (hasAuthoritativeCategories(current)) entry.categories = current;
  }
}

export function planDailyCategories(entries: DailyCategoryInput[], options: {
  previous?: DailyCategoryState; cache?: ReadonlyMap<string, DailyCategoryCache>; now?: number;
  priority?: ReadonlySet<string>;
} = {}): DailyCategoryPlan {
  const now = options.now ?? Date.now();
  const state: DailyCategoryState = { schemaVersion: 1, jobs: {} };
  const ready: DailyCategoryTask[] = [];
  for (const entry of entries) {
    const id = entry.fullName.toLowerCase();
    if (state.jobs[id]) throw new Error(`Duplicate daily category entry: ${entry.fullName}`);
    const input = categoryInput(entry);
    const sourceHash = contentSourceHash(entry, "categories");
    const old = options.previous?.jobs[id];
    const reusable = old?.sourceHash === sourceHash && old.policyVersion === CATEGORY_POLICY_VERSION;
    const hold = matchingEditorialHold(entry);
    const evidence = hasContentEvidence(entry);
    const review = reviewedCategories(input);
    let current = currentCategoryAssignments(input, entry.categories);
    // An identity-only change is not represented in the older assignment hash.
    // Drop content known to be the previous job's output; a fresh matching review wins.
    if (old?.policyVersion === CATEGORY_POLICY_VERSION && !reusable && old.categories
      && JSON.stringify(current) === JSON.stringify(currentCategoryAssignments(input, old.categories))) current = [];
    entry.categories = review ?? current;
    if (!hasAuthoritativeCategories(entry.categories) && !hold && evidence) {
      const completed = reusable && old.status === "complete" ? old : options.cache?.get(id);
      if (completed?.sourceHash === sourceHash) {
        // Validate the assignments as well. Never rebind a legacy SQLite cache.
        const cached = currentCategoryAssignments(input, completed.categories);
        if (hasAuthoritativeCategories(cached)) entry.categories = cached;
      }
      if (!hasAuthoritativeCategories(entry.categories)) entry.categories = fallbackCategoryAssignments(input);
    }
    const job: DailyCategoryJob = hasAuthoritativeCategories(entry.categories)
      ? { sourceHash, policyVersion: CATEGORY_POLICY_VERSION, status: "complete", attempts: reusable ? old.attempts : 0,
        categories: entry.categories }
      : hold
        ? { sourceHash, policyVersion: CATEGORY_POLICY_VERSION, status: "review-required", attempts: reusable ? old.attempts : 0,
          reviewReason: hold.reason }
        : !evidence
          ? { sourceHash, policyVersion: CATEGORY_POLICY_VERSION, status: "missing-source", attempts: 0 }
          : reusable && old.status === "retry" ? { ...old }
            : { sourceHash, policyVersion: CATEGORY_POLICY_VERSION, status: "pending", attempts: 0 };
    state.jobs[id] = job;
    const nextAttemptAt = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : 0;
    if ((job.status === "pending" || job.status === "retry") && (!Number.isFinite(nextAttemptAt) || nextAttemptAt <= now)) {
      ready.push({ fullName: id, entry, job });
    }
  }
  ready.sort((a, b) => Number(options.priority?.has(b.fullName) ?? false) - Number(options.priority?.has(a.fullName) ?? false)
    || a.job.attempts - b.job.attempts || b.entry.stars - a.entry.stars || a.fullName.localeCompare(b.fullName));
  return { state, ready };
}

/** Persistent backoff owns retries, so each daily task makes only one HTTP attempt. */
export function dailyCategoryWorker(options: Pick<DeepSeekRequestOptions, "apiKey" | "baseURL" | "model">) {
  return (entry: DailyCategoryInput) => classifyWithDeepSeek({
    name: entry.fullName, type: entry.type, packageName: entry.install?.packageName,
    repositoryPath: entry.install?.repositoryPath, description: entry.description ?? "",
    readmeSummary: entry.readmeSummary ?? null, topics: entry.topics ?? [],
  }, { ...options, timeoutMs: 120_000, thinking: "enabled", maxAttempts: 1 });
}

export async function runDailyCategories(plan: DailyCategoryPlan, options: {
  worker: (entry: DailyCategoryInput) => Promise<CategorySuggestion[]>;
  model: string; limit?: number; concurrency?: number; now?: () => number;
  onProgress?: (task: DailyCategoryTask) => void;
}) {
  const limit = options.limit ?? 200;
  const concurrency = options.concurrency ?? 5;
  if (!Number.isInteger(limit) || limit < 0 || limit > 2000) throw new Error("category limit must be from 0 to 2000");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256) throw new Error("category concurrency must be from 1 to 256");
  const tasks = plan.ready.slice(0, limit);
  const now = options.now ?? Date.now;
  let next = 0, attempted = 0, completed = 0, failed = 0;
  let persistenceFailure: { error: unknown } | undefined;
  const persist = (task: DailyCategoryTask) => {
    try { options.onProgress?.(task); } catch (error) { persistenceFailure ??= { error }; }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (!persistenceFailure && next < tasks.length) {
      const task = tasks[next++];
      const { job, entry } = task;
      job.attempts++;
      job.lastAttemptAt = new Date(now()).toISOString();
      job.status = "retry";
      job.nextAttemptAt = nextContentAttemptAt(job.attempts, now());
      persist(task);
      if (persistenceFailure) break;
      attempted++;
      try {
        const result = normalizeCategorySuggestions(await options.worker(entry)).slice(0, 1);
        if (result.length) {
          entry.categories = bindCategoryAssignments(categoryInput(entry), toDeepSeekAssignments(result, options.model, new Date(now()).toISOString()));
          job.categories = entry.categories;
          job.status = "complete";
          delete job.nextAttemptAt;
          delete job.failure;
          completed++;
        } else { job.failure = "empty-or-invalid-result"; failed++; }
      } catch { job.failure = "request-failed"; failed++; }
      persist(task);
    }
  }));
  // Let already-started requests persist before the caller exits or releases a lock.
  if (persistenceFailure) throw persistenceFailure.error;
  return { attempted, completed, failed };
}
