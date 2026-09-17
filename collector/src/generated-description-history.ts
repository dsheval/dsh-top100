/** Source-bound model history; output acceptance is not human semantic verification. */
import { createHash } from 'node:crypto';
import type { DshPlugin, GeneratedDescriptionVersion } from '@dsh-top100/schema';
import reviews from '../config/reviewed-descriptions.json';
import { hasSelectedReadmeEvidence } from './readme-evidence.js';
import { hasSkillSourceEvidence } from './skill-evidence.js';
import { contentSourceHash, matchingDescriptionHold } from './content-source.js';
import { isUsableChineseDescription } from './description-rules.js';
import type { DescriptionJob } from './description-jobs.js';
import { publicationDescriptionSourceHash } from './publication-description-review.js';

type Source = Pick<DshPlugin, 'fullName' | 'description' | 'install'> & {
 type: string;
 readmeSummary?: string | null;
 descriptionHistory?: GeneratedDescriptionVersion[]; descriptionHistoryHold?: string;
};
export const hasFixedDescriptionReview = (source: Pick<Source, 'fullName'>) => Object.hasOwn(reviews, source.fullName.toLowerCase());
const validTime = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function approvedGeneratedSourceChange(source: Source, job?: DescriptionJob): DescriptionJob['sourceChangeReview'] | undefined {
 const decision=job?.sourceChangeReview;
 if (!decision || !['reuse', 'regenerate'].includes(decision.decision) || job.reviewLocked || !validTime(decision.reviewedAt)
  || typeof decision.reason !== 'string' || !decision.reason.trim() || !proven(source)
  || hasFixedDescriptionReview(source) || decision.sourceProofHash!==publicationDescriptionSourceHash({ ...source, readmeSummary: source.readmeSummary ?? undefined })) return undefined;
 return decision;
}
const digest = (record: Omit<GeneratedDescriptionVersion, 'id'>) => createHash('sha256').update(JSON.stringify(record)).digest('hex');
function proven(source: Source): boolean {
 return ['skill','cordis-plugin'].includes(source.type) && source.install.discovery?.status === 'verified' && !matchingDescriptionHold(source)
   && (source.type === 'skill' ? hasSkillSourceEvidence(source) : !!source.install.packageName && hasSelectedReadmeEvidence(source));
}
export function createGeneratedDescriptionVersion(source: Source, job?: DescriptionJob): GeneratedDescriptionVersion | null {
 if (hasFixedDescriptionReview(source) || !proven(source) || job?.status !== 'complete' || job.origin !== 'model'
   || job.reviewLocked || !validTime(job.generatedAt ?? job.lastAttemptAt) || !isUsableChineseDescription(job.descriptionZh ?? '')
   || contentSourceHash(source, 'description') !== job.sourceHash) return null;
 const { packageName, repositoryPath, discovery } = source.install;
 const record: Omit<GeneratedDescriptionVersion, 'id'> = { policy: 'source-bound-model-v1',
   generatedAt: job.generatedAt ?? job.lastAttemptAt!, descriptionZh: job.descriptionZh!, sourceHash: job.sourceHash,
   source: { fullName: source.fullName, type: source.type as DshPlugin['type'], description: source.description, readmeSummary: source.readmeSummary ?? null,
     install: { method: source.install.method, needsConfig: source.install.needsConfig, ...(packageName ? {packageName} : {}), ...(repositoryPath ? {repositoryPath} : {}), discovery: structuredClone(discovery) } } };
 return { ...record, id: digest(record) };
}
export function validGeneratedDescriptionVersion(value: GeneratedDescriptionVersion): boolean {
 if (!value || value.policy !== 'source-bound-model-v1' || !value.source || !validTime(value.generatedAt)
   || !isUsableChineseDescription(value.descriptionZh)) return false;
 try {
  const {id, ...record} = value;
  return digest(record) === id && proven(value.source) && contentSourceHash(value.source, 'description') === value.sourceHash;
 } catch { return false; }
}
export function mergeGeneratedHistory(...histories: Array<GeneratedDescriptionVersion[] | undefined>): GeneratedDescriptionVersion[] {
 return [...new Map(histories.flatMap(h=>h??[]).filter(validGeneratedDescriptionVersion).map(v=>[v.id,v])).values()]
  .sort((a,b)=>Date.parse(b.generatedAt)-Date.parse(a.generatedAt)).slice(0,3);
}
function sameIdentity(source: Source, version: GeneratedDescriptionVersion): boolean {
 const old=version.source, a=source.install.discovery?.skill, b=old.install.discovery?.skill;
 return source.fullName.toLowerCase()===old.fullName.toLowerCase() && source.type===old.type
  && (source.install.packageName??null)===(old.install.packageName??null)
  && (source.install.repositoryPath??null)===(old.install.repositoryPath??null)
  && (source.type!=='skill' || !!a && !!b && a.name===b.name && a.path===b.path);
}
/** Full document evidence must match too: equal excerpts do not prove equal functionality. */
export function generatedSourceUnchanged(source: Source, version: GeneratedDescriptionVersion): boolean {
 if (!validGeneratedDescriptionVersion(version) || !sameIdentity(source,version) || !proven(source)) return false;
 const old=version.source;
 const document=(s: Source)=>s.type==='skill'?s.install.discovery?.skill?.documentSha256:s.install.discovery?.readme?.documentSha256;
 return document(source)===document(old) && contentSourceHash(source,'description')===version.sourceHash;
}
export function generatedHistoryDisplay(source: Source): GeneratedDescriptionVersion | null {
 if (hasFixedDescriptionReview(source) || source.descriptionHistoryHold || matchingDescriptionHold(source)) return null;
 const latest=mergeGeneratedHistory(source.descriptionHistory)[0];
 return latest && sameIdentity(source,latest) ? latest : null;
}
