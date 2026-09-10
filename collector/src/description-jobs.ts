import { contentSourceHash, matchingEditorialHold, hasContentEvidence, nextContentAttemptAt, type ContentSource } from './content-source.js';
import { isGenericDescriptionZh } from './llm.js';

export interface DescriptionSource extends ContentSource { id: string; description: string; readmeSummary: string | null; descriptionZh: string | null; stars: number; tags?: string[]; install?: { packageName?: string; repositoryPath?: string }; }
export interface DescriptionJob {
  sourceHash: string;
  status: 'pending' | 'retry' | 'missing-source' | 'review-required' | 'complete';
  reviewReason?: string;
  descriptionZh?: string;
  tagsZh?: string[];
  lastAttemptAt?: string;
  attempts: number;
  nextAttemptAt?: string;
}
export function descriptionSourceHash(source: ContentSource): string {
  return contentSourceHash(source, 'description');
}
export function hasChineseDescription(value: string | null | undefined): boolean {
  return Boolean(value && !isGenericDescriptionZh(value));
}
export function planDescriptionJobs(sources: DescriptionSource[], previous: Record<string, DescriptionJob>, priority: Set<string>, now: number) {
  const jobs: Record<string, DescriptionJob> = {};
  const ready: DescriptionSource[] = [];
  for (const source of sources) {
    const sourceHash = descriptionSourceHash(source);
    const old = previous[source.id];
    const unchanged = old?.sourceHash === sourceHash;
    const complete = hasChineseDescription(source.descriptionZh);
    const hold = matchingEditorialHold(source);
    const job: DescriptionJob = complete
      ? { sourceHash, status: 'complete', attempts: unchanged ? old.attempts : 0, descriptionZh: source.descriptionZh!, tagsZh: source.tags ?? [] }
      : hold
        ? { sourceHash, status: 'review-required', attempts: unchanged ? old.attempts : 0, reviewReason: hold.reason }
      : !hasContentEvidence(source)
        ? { sourceHash, status: 'missing-source', attempts: 0 }
        : unchanged && old.status === 'retry'
          ? { ...old }
          : { sourceHash, status: 'pending', attempts: 0 };
    jobs[source.id] = job;
    const next = job.nextAttemptAt ? Date.parse(job.nextAttemptAt) : 0;
    if ((job.status === 'pending' || job.status === 'retry') && (!Number.isFinite(next) || next <= now)) ready.push(source);
  }
  // Within priority groups, let new/changed evidence run before repeatedly failing items.
  ready.sort((a, b) => Number(priority.has(b.id.toLowerCase())) - Number(priority.has(a.id.toLowerCase())) || jobs[a.id].attempts - jobs[b.id].attempts || b.stars - a.stars);
  return { jobs, ready };
}
export function recordDescriptionAttempt(job: DescriptionJob, success: boolean, now: number): void {
  job.attempts++;
  job.lastAttemptAt = new Date(now).toISOString();
  job.status = success ? 'complete' : 'retry';
  if (success) delete job.nextAttemptAt;
  else job.nextAttemptAt = nextContentAttemptAt(job.attempts, now);
}
