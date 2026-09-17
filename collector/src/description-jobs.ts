import { contentSourceHash, matchesContentSourceHash, matchingDescriptionHold, hasContentEvidence, nextContentAttemptAt, type ContentSource } from './content-source.js';
import { isGenericDescriptionZh } from './llm.js';
import { descriptionQualityIssue } from './description-rules.js';

export interface DescriptionSource extends ContentSource { id: string; description: string; readmeSummary: string | null; descriptionZh: string | null; stars: number; tags?: string[]; install?: { packageName?: string; repositoryPath?: string }; }
export interface DescriptionJob {
  /** Explicit source-difference review; a changed hash alone never grants regeneration. */
  sourceChangeReview?: { sourceProofHash: string; decision: 'reuse' | 'regenerate'; reviewedAt: string; reason: string };
  generatedAt?: string;
  descriptionHistory?: import('@dsh-top100/schema').GeneratedDescriptionVersion[];
  descriptionHistoryHold?: string;
  /** Durable success receipt for a crash before older source/cache holds are replaced. */
  descriptionHistoryResolution?: { versionId: string; replacedVersionIds: string[]; hold: string };
  dailySourceHash?: string;
  boardSourceHash?: string;
  sourceHash: string;
  status: 'pending' | 'retry' | 'missing-source' | 'review-required' | 'complete';
  reviewReason?: string;
  reviewLocked?: boolean;
  descriptionZh?: string;
  /** Retained for review; never replayed as a completed result. */
  rejectedDescriptionZh?: string;
  origin?: 'reviewed' | 'author' | 'model' | 'legacy';
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
export function planDescriptionJobs<T extends DescriptionSource>(sources: T[], previous: Record<string, DescriptionJob>, priority: Set<string>, now: number) {
  const jobs: Record<string, DescriptionJob> = {};
  const ready: T[] = [];
  for (const source of sources) {
    const sourceHash = descriptionSourceHash(source);
    const old = previous[source.id];
    const unchanged = matchesContentSourceHash(source, 'description', old?.sourceHash);
    const complete = hasChineseDescription(source.descriptionZh);
    const hold = matchingDescriptionHold(source);
    const rejected = descriptionQualityIssue(source.descriptionZh) ? source.descriptionZh!
      : unchanged && descriptionQualityIssue(old.descriptionZh) ? old.descriptionZh! : undefined;
    const job: DescriptionJob = complete
      ? { ...(unchanged && old.generatedAt ? { generatedAt: old.generatedAt } : {}), ...(unchanged && old.lastAttemptAt ? { lastAttemptAt: old.lastAttemptAt } : {}), sourceHash, status: 'complete', attempts: unchanged ? old.attempts : 0, descriptionZh: source.descriptionZh!, tagsZh: source.tags ?? [] }
      : hold
        ? { ...(unchanged ? old : {}), sourceHash, status: 'review-required', attempts: unchanged ? old.attempts : 0, reviewReason: hold.reason,
          ...(rejected ? { rejectedDescriptionZh: rejected } : {}) }
      : rejected
        ? { ...(unchanged ? old : {}), sourceHash, status: 'review-required', attempts: unchanged ? old.attempts : 0,
          reviewLocked: true, rejectedDescriptionZh: rejected,
          reviewReason: `${descriptionQualityIssue(rejected)}存量纠正需定向复核，不自动付费重写。` }
      : unchanged && old.reviewLocked
        ? { ...old, sourceHash, status: 'review-required' }
      : !hasContentEvidence(source)
        ? { sourceHash, status: 'missing-source', attempts: 0 }
        : unchanged && old.status === 'retry'
          ? { ...old, sourceHash }
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
