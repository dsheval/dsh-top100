import { createHash } from 'node:crypto';
import { isGenericDescriptionZh } from './llm.js';

export interface DescriptionSource { id: string; description: string; readmeSummary: string | null; descriptionZh: string | null; stars: number; }
export interface DescriptionJob {
  sourceHash: string;
  status: 'pending' | 'retry' | 'missing-source' | 'complete';
  attempts: number;
  nextAttemptAt?: string;
}
export function descriptionSourceHash(source: Pick<DescriptionSource, 'description' | 'readmeSummary'>): string {
  return createHash('sha256').update(JSON.stringify([source.description, source.readmeSummary])).digest('hex');
}
export function hasChineseDescription(value: string | null | undefined): boolean {
  return Boolean(value && /[\u4e00-\u9fff]/.test(value) && !isGenericDescriptionZh(value));
}
export function planDescriptionJobs(sources: DescriptionSource[], previous: Record<string, DescriptionJob>, priority: Set<string>, now: number) {
  const jobs: Record<string, DescriptionJob> = {};
  const ready: DescriptionSource[] = [];
  for (const source of sources) {
    const sourceHash = descriptionSourceHash(source);
    const old = previous[source.id];
    const unchanged = old?.sourceHash === sourceHash;
    const complete = hasChineseDescription(source.descriptionZh);
    const evidence = `${source.description} ${source.readmeSummary || ''}`.replace(/<[^>]*>|\s+/g, ' ').trim();
    const job: DescriptionJob = complete
      ? { sourceHash, status: 'complete', attempts: unchanged ? old.attempts : 0 }
      : evidence.length < 12
        ? { sourceHash, status: 'missing-source', attempts: 0 }
        : unchanged && old.status !== 'complete' && old.status !== 'missing-source'
          ? { ...old }
          : { sourceHash, status: 'pending', attempts: 0 };
    jobs[source.id] = job;
    if ((job.status === 'pending' || job.status === 'retry') && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now)) ready.push(source);
  }
  // Within priority groups, let new/changed evidence run before repeatedly failing items.
  ready.sort((a, b) => Number(priority.has(b.id.toLowerCase())) - Number(priority.has(a.id.toLowerCase())) || jobs[a.id].attempts - jobs[b.id].attempts || b.stars - a.stars);
  return { jobs, ready };
}
export function recordDescriptionAttempt(job: DescriptionJob, success: boolean, now: number): void {
  job.attempts++;
  job.status = success ? 'complete' : 'retry';
  if (success) delete job.nextAttemptAt;
  else job.nextAttemptAt = new Date(now + Math.min(7, 2 ** (job.attempts - 1)) * 86_400_000).toISOString();
}
