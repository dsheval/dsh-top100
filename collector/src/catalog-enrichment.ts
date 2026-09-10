/** Resumable content jobs for a frozen catalog; ranks and repository evidence stay unchanged. */
import {
  CATEGORY_DEFINITIONS, CATEGORY_POLICY_VERSION, bindCategoryAssignments, currentCategoryAssignments,
  fallbackCategoryAssignments, hasAuthoritativeCategories, normalizeCategorySuggestions, toDeepSeekAssignments,
  type CategorySuggestion,
} from "./categories.js";
import { reviewedCategories, reviewedDescription } from "./editorial.js";
import { hasChineseDescription } from "./description-jobs.js";
import { extractJson, fallbackDescriptionZh, type ZhResult } from "./llm.js";
import { PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";
import type { RankingEntry, RankingsDocument } from "./rankings.js";

import { DESCRIPTION_POLICY_VERSION, contentSourceHash, matchingEditorialHold, hasContentEvidence, nextContentAttemptAt } from "./content-source.js";
export { DESCRIPTION_POLICY_VERSION } from "./content-source.js";
export type EnrichmentKind = "description" | "categories";
export type EnrichmentStatus = "pending" | "retry" | "missing-source" | "review-required" | "complete";
export interface EnrichmentJob {
  sourceHash: string;
  policyVersion: number;
  status: EnrichmentStatus;
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  failure?: "request-failed" | "empty-or-invalid-result";
  reviewReason?: string;
  descriptionZh?: string;
  tagsZh?: string[];
  categories?: RankingEntry["categories"];
}

export interface EnrichmentState {
  schemaVersion: 1;
  jobs: Record<string, Record<EnrichmentKind, EnrichmentJob>>;
}
export interface EnrichmentTask { fullName: string; kind: EnrichmentKind; entry: RankingEntry; job: EnrichmentJob; }
export interface EnrichmentPlan {
  document: RankingsDocument;
  state: EnrichmentState;
  ready: EnrichmentTask[];
  priority: Set<string>;
}

export const enrichmentSourceHash = contentSourceHash;

export function planCatalogEnrichment(input: RankingsDocument, previous: EnrichmentState | undefined, now: number): EnrichmentPlan {
  if (!Array.isArray(input.rankings?.total) || !input.rankings.total.length
    || !Array.isArray(input.rankings.hot) || !Array.isArray(input.rankings.rising)) {
    throw new Error("Input must be a nonempty frozen rankings.json snapshot");
  }
  const document = structuredClone(input);
  const entries = [...document.rankings.total, ...(document.directories?.skills ?? [])];
  const priority = new Set([...document.rankings.total.slice(0, 100), ...document.rankings.hot, ...document.rankings.rising]
    .map(entry => entry.fullName.toLowerCase()));
  const state: EnrichmentState = { schemaVersion: 1, jobs: {} };
  const ready: EnrichmentTask[] = [];
  for (const entry of entries) {
    const id = entry.fullName.toLowerCase();
    if (state.jobs[id]) throw new Error(`Duplicate catalog entry: ${entry.fullName}`);
    const old = previous?.jobs[id];
    const hold = matchingEditorialHold(entry);
    const reviewZh = reviewedDescription(entry);
    const oldDescription = old?.description;
    // Only discard text known to come from the old source. Independently supplied
    // Chinese and a matching editorial review may already describe the new source.
    const staleChinese = oldDescription?.policyVersion === DESCRIPTION_POLICY_VERSION
      && oldDescription.sourceHash !== enrichmentSourceHash(entry, "description")
      && oldDescription.descriptionZh === entry.descriptionZh;
    const existingChinese = !staleChinese && hasChineseDescription(entry.descriptionZh);
    entry.descriptionZh = reviewZh ?? (existingChinese ? entry.descriptionZh : hold ? PENDING_DESCRIPTION_ZH
      : fallbackDescriptionZh({ ...entry, readmeSummary: entry.readmeSummary ?? null }));
    const reviewCategories = reviewedCategories(entry);
    let current = currentCategoryAssignments(entry, entry.categories);
    const oldCategories = old?.categories;
    if (oldCategories?.policyVersion === CATEGORY_POLICY_VERSION
      && oldCategories.sourceHash !== enrichmentSourceHash(entry, "categories") && oldCategories.categories
      && JSON.stringify(current) === JSON.stringify(currentCategoryAssignments(entry, oldCategories.categories))) current = [];
    entry.categories = reviewCategories ?? (hasAuthoritativeCategories(current) || hold ? current : fallbackCategoryAssignments(entry));
    const jobs = {} as Record<EnrichmentKind, EnrichmentJob>;
    for (const kind of ["description", "categories"] as const) {
      const sourceHash = enrichmentSourceHash(entry, kind);
      const policyVersion = kind === "description" ? DESCRIPTION_POLICY_VERSION : CATEGORY_POLICY_VERSION;
      const cached = old?.[kind];
      const reusable = cached?.sourceHash === sourceHash && cached.policyVersion === policyVersion;
      if (reusable && cached.status === "complete" && !hold && hasContentEvidence(entry)) {
        if (kind === "description" && !reviewZh && !existingChinese && hasChineseDescription(cached.descriptionZh)) {
          entry.descriptionZh = cached.descriptionZh!;
          if (cached.tagsZh) entry.tags = [...cached.tagsZh];
        }
        if (kind === "categories" && !reviewCategories) {
          const categories = currentCategoryAssignments(entry, cached.categories);
          if (hasAuthoritativeCategories(categories)) entry.categories = categories;
        }
      }
      const complete = kind === "description" ? hasChineseDescription(entry.descriptionZh) : hasAuthoritativeCategories(entry.categories);
      const job: EnrichmentJob = complete
        ? { sourceHash, policyVersion, status: "complete", attempts: reusable ? cached.attempts : 0,
          ...(kind === "description" ? { descriptionZh: entry.descriptionZh, tagsZh: entry.tags } : { categories: entry.categories }) }
        : hold
          ? { sourceHash, policyVersion, status: "review-required", attempts: reusable ? cached.attempts : 0, reviewReason: hold.reason }
          : !hasContentEvidence(entry)
          ? { sourceHash, policyVersion, status: "missing-source", attempts: 0 }
          : reusable && cached.status === "retry"
            ? { ...cached }
            : { sourceHash, policyVersion, status: "pending", attempts: 0 };
      jobs[kind] = job;
      const nextAttemptAt = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : 0;
      if ((job.status === "pending" || job.status === "retry") && (!Number.isFinite(nextAttemptAt) || nextAttemptAt <= now)) {
        ready.push({ fullName: id, kind, entry, job });
      }
    }
    state.jobs[id] = jobs;
  }
  ready.sort((a, b) => Number(priority.has(b.fullName)) - Number(priority.has(a.fullName))
    || a.job.attempts - b.job.attempts || b.entry.stars - a.entry.stars
    || a.fullName.localeCompare(b.fullName) || a.kind.localeCompare(b.kind));
  return { document, state, ready, priority };
}

export function enrichmentProgress(plan: EnrichmentPlan, now: number) {
  const counts = () => ({ complete: 0, pending: 0, retry: 0, "missing-source": 0, "review-required": 0, ready: 0 });
  const description = counts();
  const categories = counts();
  for (const jobs of Object.values(plan.state.jobs)) {
    for (const kind of ["description", "categories"] as const) {
      const job = jobs[kind];
      const count = kind === "description" ? description : categories;
      count[job.status]++;
      if (job.status === "pending" || (job.status === "retry" && (!job.nextAttemptAt || !Number.isFinite(Date.parse(job.nextAttemptAt)) || Date.parse(job.nextAttemptAt) <= now))) count.ready++;
    }
  }
  return { entries: Object.keys(plan.state.jobs).length, priorityEntries: plan.priority.size, description, categories };
}

export interface EnrichmentWorkers {
  translate(entry: RankingEntry): Promise<ZhResult | null>;
  classify(entry: RankingEntry): Promise<CategorySuggestion[]>;
}
export async function runCatalogEnrichment(plan: EnrichmentPlan, options: {
  limit: number; concurrency: number; model: string; workers: EnrichmentWorkers;
  kind?: "all" | EnrichmentKind;
  now?: () => number; onProgress?: (task: EnrichmentTask) => void;
}) {
  if (!Number.isInteger(options.limit) || options.limit < 0) throw new Error("limit must be a nonnegative integer");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 256) throw new Error("concurrency must be from 1 to 256");
  const kind = options.kind ?? "all";
  if (!["all", "description", "categories"].includes(kind)) throw new Error("kind must be all, description or categories");
  const tasks = plan.ready.filter(task => kind === "all" || task.kind === kind).slice(0, options.limit);
  let next = 0;
  let completed = 0;
  let failed = 0;
  let persistenceFailure: { error: unknown } | undefined;
  const persist = (task: EnrichmentTask) => {
    try { options.onProgress?.(task); }
    catch (error) { persistenceFailure ??= { error }; }
  };
  const now = options.now ?? Date.now;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, tasks.length) }, async () => {
    while (!persistenceFailure && next < tasks.length) {
      const task = tasks[next++];
      const { job, entry, kind } = task;
      job.attempts++;
      job.lastAttemptAt = new Date(now()).toISOString();
      // A killed process must not lose the attempt or immediately hammer the same source.
      job.status = "retry";
      job.nextAttemptAt = nextContentAttemptAt(job.attempts, now());
      persist(task);
      if (persistenceFailure) break;
      let success = false;
      try {
        if (kind === "description") {
          const raw = await options.workers.translate(entry);
          const result = raw ? extractJson(JSON.stringify(raw)) : null;
          if (result) {
            entry.descriptionZh = result.descriptionZh;
            entry.tags = result.tagsZh;
            job.descriptionZh = result.descriptionZh;
            job.tagsZh = result.tagsZh;
            success = true;
          }
        } else {
          const result = normalizeCategorySuggestions(await options.workers.classify(entry));
          if (result.length) {
            entry.categories = bindCategoryAssignments(entry, toDeepSeekAssignments(result, options.model, new Date(now()).toISOString()));
            job.categories = entry.categories;
            success = true;
          }
        }
        if (!success) job.failure = "empty-or-invalid-result";
      } catch {
        // Never persist raw provider error bodies, request headers or credentials.
        job.failure = "request-failed";
      }
      if (success) {
        job.status = "complete";
        delete job.nextAttemptAt;
        delete job.failure;
        completed++;
      } else failed++;
      // Synchronous atomic persistence; no overlapping writes between async workers.
      persist(task);
    }
  }));
  // Keep the CLI's output lock until all already-dispatched workers have finished
  // and had a chance to persist their result, even after a local write failure.
  if (persistenceFailure) throw persistenceFailure.error;
  return { attempted: tasks.length, completed, failed };
}

/** Apply only content fields to duplicated leaderboards, preserving their own metrics. */
export function enrichedSnapshot(plan: EnrichmentPlan): RankingsDocument {
  const document = structuredClone(plan.document);
  const byName = new Map([...document.rankings.total, ...(document.directories?.skills ?? [])].map(entry => [entry.fullName.toLowerCase(), entry]));
  for (const key of ["hot", "rising"] as const) {
    document.rankings[key] = document.rankings[key].map(entry => {
      const updated = byName.get(entry.fullName.toLowerCase());
      return updated ? { ...entry, descriptionZh: updated.descriptionZh, categories: updated.categories, tags: updated.tags } : entry;
    });
  }
  document.categories = CATEGORY_DEFINITIONS.map(definition => ({ ...definition,
    count: [...document.rankings.total, ...(document.directories?.skills ?? [])].filter(entry => entry.categories.some(category => category.id === definition.id)).length }));
  return document;
}
