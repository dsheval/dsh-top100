/** Daily summaries reuse the same source gates as frozen catalog enrichment. */
import type { DshPlugin } from "@dsh-top100/schema";
import { matchingDescriptionHold, hasContentEvidence, matchesContentSourceHash, sameDescriptionSource } from "./content-source.js";
import { reviewedDescription } from "./editorial.js";
import { descriptionSourceHash, hasChineseDescription, planDescriptionJobs, recordDescriptionAttempt, type DescriptionJob } from "./description-jobs.js";
import { extractJson, fallbackDescriptionZh, type ZhResult } from "./llm.js";
import { descriptionQualityIssue, PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";
import type { ZhEntry } from "./zh-util.js";

export function prepareDailyDescriptions(
  sources: DshPlugin[], previousSources: Map<string, DshPlugin>, cache: Map<string, ZhEntry>,
  previousJobs: Record<string, DescriptionJob>, priority: Set<string>, now: number,
) {
  const migratedJobs = { ...previousJobs };
  const origins = new Map<string, DescriptionJob['origin']>();
  for (const source of sources) {
    const hash = descriptionSourceHash(source);
    const previous = previousSources.get(source.id.toLowerCase());
    const previousMatches = !!previous && sameDescriptionSource(source, previous);
    const matches = (oldHash?: string) => matchesContentSourceHash(source, "description", oldHash)
      || previousMatches && matchesContentSourceHash(previous!, "description", oldHash);
    const originalCache = cache.get(source.id);
    const cached = originalCache && matches(originalCache.sourceHash) ? { ...originalCache, sourceHash: hash } : originalCache;
    const originalJob = previousJobs[source.id];
    const oldJob = originalJob && matches(originalJob.sourceHash) ? { ...originalJob, sourceHash: hash } : originalJob;
    if (oldJob && oldJob !== originalJob) migratedJobs[source.id] = oldJob;
    const hold = matchingDescriptionHold(source);
    const review = reviewedDescription(source);
    // Fresh collection clears generated fields even when a fixed review supplies
    // the summary. Carry tags from the full same-source market in that path too.
    if (previous && sameDescriptionSource(source, previous) && !hasChineseDescription(source.descriptionZh)) {
      source.tags = [...new Set([...source.tags, ...previous.tags])];
    }
    // Collection can carry forward an old record; do not mistake that copy for a new edit.
    if (previous && !sameDescriptionSource(source, previous) && source.descriptionZh === previous.descriptionZh) source.descriptionZh = null;
    if (cached?.sourceHash && cached.sourceHash !== hash && source.descriptionZh === cached.descriptionZh) source.descriptionZh = null;
    if (oldJob && oldJob.sourceHash !== hash && source.descriptionZh === oldJob.descriptionZh) source.descriptionZh = null;
    if (review) { source.descriptionZh = review; origins.set(source.id, 'reviewed'); }
    else if (previous && sameDescriptionSource(source, previous) && hasChineseDescription(previous.descriptionZh)) {
      // The current market source is newer than its derived cache (e.g. a reviewed merge).
      if (!hasChineseDescription(source.descriptionZh) || (cached && source.descriptionZh === cached.descriptionZh && source.descriptionZh !== previous.descriptionZh)) {
        source.descriptionZh = previous.descriptionZh;
        source.tags = [...new Set([...source.tags, ...previous.tags])];
      }
    } else if (!hasChineseDescription(source.descriptionZh) && !hold && hasContentEvidence(source) && cached?.sourceHash === hash && hasChineseDescription(cached.descriptionZh)) {
      source.descriptionZh = cached.descriptionZh;
      source.tags = [...new Set([...source.tags, ...cached.tagsZh])];
    }
    if (!hasChineseDescription(source.descriptionZh) && !hold && hasContentEvidence(source)
      && oldJob?.sourceHash === hash && oldJob.status === "complete" && hasChineseDescription(oldJob.descriptionZh)) {
      source.descriptionZh = oldJob.descriptionZh!;
      source.tags = [...new Set([...source.tags, ...(oldJob.tagsZh ?? [])])];
    }
    if (!hasChineseDescription(source.descriptionZh)) {
      const rejected = [source.descriptionZh, previousMatches ? previous?.descriptionZh : null,
        cached?.sourceHash === hash ? cached.descriptionZh : null, oldJob?.sourceHash === hash ? oldJob.descriptionZh : null]
        .find(value => descriptionQualityIssue(value));
      if (rejected) migratedJobs[source.id] = { ...(oldJob?.sourceHash === hash ? oldJob : {}), sourceHash: hash,
        status: 'review-required', attempts: oldJob?.sourceHash === hash ? oldJob.attempts : 0,
        reviewLocked: true, rejectedDescriptionZh: rejected,
        reviewReason: `${descriptionQualityIssue(rejected)}存量纠正需定向复核，不自动付费重写。` };
      const locked = migratedJobs[source.id]?.sourceHash === hash && migratedJobs[source.id]?.reviewLocked;
      source.descriptionZh = hold || rejected || locked ? PENDING_DESCRIPTION_ZH : fallbackDescriptionZh(source);
      if (hasChineseDescription(source.descriptionZh)) origins.set(source.id, 'author');
    }
    if (!origins.has(source.id) && hasChineseDescription(source.descriptionZh)) {
      origins.set(source.id, oldJob?.sourceHash === hash && oldJob.descriptionZh === source.descriptionZh ? oldJob.origin ?? 'legacy'
        : cached?.sourceHash === hash && cached.descriptionZh === source.descriptionZh ? cached.origin ?? 'legacy' : 'legacy');
    }
  }
  const plan = planDescriptionJobs(sources, migratedJobs, priority, now);
  for (const [id, origin] of origins) if (plan.jobs[id].status === 'complete') plan.jobs[id].origin = origin;
  return plan;
}

export async function runDailyDescriptions(
  sources: DshPlugin[], plan: ReturnType<typeof planDescriptionJobs>, options: {
    limit: number; concurrency: number; worker: (source: DshPlugin) => Promise<ZhResult | null>;
    now?: () => number; onProgress?: () => void;
  },
) {
  if (!Number.isInteger(options.limit) || options.limit < 0 || options.limit > 3000) throw new Error("Invalid description batch limit");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) throw new Error("Invalid description concurrency");
  const byId = new Map(sources.map(source => [source.id, source]));
  const tasks = plan.ready.slice(0, options.limit);
  const now = options.now ?? Date.now;
  let next = 0;
  let completed = 0;
  let persistenceFailure: { error: unknown } | undefined;
  const persist = () => { try { options.onProgress?.(); } catch (error) { persistenceFailure ??= { error }; } };
  await Promise.all(Array.from({ length: Math.min(tasks.length, options.concurrency) }, async () => {
    while (!persistenceFailure && next < tasks.length) {
      const task = tasks[next++];
      const source = byId.get(task.id)!;
      const job = plan.jobs[source.id];
      recordDescriptionAttempt(job, false, now());
      persist();
      if (persistenceFailure) break;
      let result: ZhResult | null = null;
      try { const raw = await options.worker(source); result = raw ? extractJson(JSON.stringify(raw)) : null; } catch { /* safe retry state; no provider details */ }
      if (result) {
        source.descriptionZh = result.descriptionZh;
        source.tags = [...new Set([...source.tags, ...result.tagsZh])];
        job.descriptionZh = result.descriptionZh;
        job.tagsZh = [...source.tags];
        job.status = "complete";
        job.origin = 'model';
        delete job.nextAttemptAt;
        completed++;
      }
      persist();
    }
  }));
  if (persistenceFailure) throw persistenceFailure.error;
  return { attempted: tasks.length, completed, failed: tasks.length - completed };
}

export function updateDailyDescriptionCache(sources: DshPlugin[], cache: Map<string, ZhEntry>, jobs?: Record<string, DescriptionJob>): void {
  for (const source of sources) {
    if (!hasChineseDescription(source.descriptionZh)) { cache.delete(source.id); continue; }
    const previous = cache.get(source.id);
    const sourceHash = descriptionSourceHash(source);
    const origin = jobs?.[source.id]?.descriptionZh === source.descriptionZh && jobs[source.id].sourceHash === sourceHash
      ? jobs[source.id].origin : previous?.descriptionZh === source.descriptionZh && previous.sourceHash === sourceHash ? previous.origin : undefined;
    cache.set(source.id, { descriptionZh: source.descriptionZh!, tagsZh: source.tags.filter(tag => /[\u4e00-\u9fff]/.test(tag)),
      origin: origin ?? 'legacy', sourceHash, summaryKey: source.readmeSummary ?? undefined });
  }
}
