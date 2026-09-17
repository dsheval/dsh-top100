import { contentSourceHash, sameDescriptionSource, type ContentSource } from "./content-source.js";
import { hasSkillSourceEvidence } from './skill-evidence.js';

export interface DailyScopeJob {
  /** Only a newly observed or changed source may create this persistent eligibility marker. */
  dailySourceHash?: string;
  attempts?: number;
}

/** Narrow a planned pending/retry task; never turn unchanged backlog into paid work.
 * Existing planners retain responsibility for evidence, fixed reviews and backoff.
 * A missing full baseline fails closed, even if derived job caches are present.
 */
export function bindDailySourceJob(entry: ContentSource, previousSources: ReadonlyMap<string, ContentSource>,
  previousJob: DailyScopeJob | undefined, job: DailyScopeJob): boolean {
  if (!previousSources.size || entry.install?.discovery?.status === "review-required") return false;
  if ((job.attempts ?? 0) >= 2) return false;
  const id = (entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase();
  const previous = previousSources.get(id);
  // Enrolling old Skills in the description-only backlog is evidence migration,
  // not an observed source change authorizing category or general backlog calls.
  if (previous && hasSkillSourceEvidence(entry) && !hasSkillSourceEvidence(previous)) return false;
  // A different selected package needs an identity review, not automatic paid reuse.
  if (previous && [previous.type, previous.install?.packageName ?? null, previous.install?.repositoryPath ?? null].join("\n")
    !== [entry.type, entry.install?.packageName ?? null, entry.install?.repositoryPath ?? null].join("\n")) return false;
  const hash = contentSourceHash(entry, "description");
  const changed = !previous || !sameDescriptionSource(entry, previous);
  if (!changed && previousJob?.dailySourceHash !== hash) return false;
  if (previousJob?.dailySourceHash === hash) {
    job.attempts = Math.max(job.attempts ?? 0, previousJob.attempts ?? 0);
    if (job.attempts >= 2) return false;
  }
  job.dailySourceHash = hash;
  return true;
}
