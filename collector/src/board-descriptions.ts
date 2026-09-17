/** Today's ranked scope, description eligibility and public coverage evidence. */
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument, RankingEntry } from './rankings.js';
import { descriptionSourceHash, type DescriptionJob } from './description-jobs.js';
import { matchingDescriptionHold, hasContentEvidence } from './content-source.js';
import { verifiedDescriptionZh } from './published-description.js';
import { lastVerifiedDescription } from './description-continuity.js';
import { descriptionFor, descriptionQualityIssue, PENDING_DESCRIPTION_ZH, type DescriptionStatus } from './description-rules.js';

export function boardDescriptionScope(rankings: RankingsDocument): Set<string> {
  return new Set(['hot', 'rising'].flatMap(board => rankings.rankings[board as 'hot' | 'rising']
    .slice(0, 100).map(entry => entry.fullName.toLowerCase())));
}

export function hasPublishedChinese(entry: RankingEntry): boolean {
  if (entry.descriptionStatus?.state === 'stale') return false;
  return descriptionFor({ ...entry, descriptionZh: verifiedDescriptionZh({ ...entry, descriptionStatus: undefined }) }) !== PENDING_DESCRIPTION_ZH;
}

/** A board grants only missing-description eligibility, never an identity/evidence bypass. */
export function bindBoardDescriptionJob(entry: DshPlugin, scope: ReadonlySet<string>,
  previous: ReadonlyMap<string, DshPlugin>, old: DescriptionJob | undefined, job: DescriptionJob): boolean {
  if (!scope.has(entry.fullName.toLowerCase()) || job.status !== 'pending' && job.status !== 'retry') return false;
  if (!previous.size || matchingDescriptionHold(entry) || !hasContentEvidence(entry)
    || entry.install.discovery?.status !== 'verified') return false;
  const before = previous.get(entry.fullName.toLowerCase());
  if (before && [before.type, before.install.packageName ?? '', before.install.repositoryPath ?? ''].join('\n')
    !== [entry.type, entry.install.packageName ?? '', entry.install.repositoryPath ?? ''].join('\n')) {
    job.status = 'review-required'; job.reviewLocked = true;
    job.reviewReason = '所选插件包、目录或收录类型发生变化，待确认当前对象的功能资料。';
    return false;
  }
  const hash = descriptionSourceHash(entry);
  if (old?.sourceHash === hash) job.attempts = Math.max(job.attempts, old.attempts);
  if (job.attempts >= 2) return false;
  job.boardSourceHash = hash;
  return true;
}

export function missingDescriptionStatus(entry: RankingEntry, job?: DescriptionJob): DescriptionStatus | undefined {
  if (hasPublishedChinese({ ...entry, descriptionStatus: undefined })) return undefined;
  const previous = lastVerifiedDescription(entry);
  if (previous) return previous.status;
  const hold = matchingDescriptionHold(entry);
  if (hold) return { state: 'review-required', reason: hold.reason };
  const qualityIssue = descriptionQualityIssue(entry.descriptionZh);
  if (qualityIssue) return { state: 'review-required', reason: qualityIssue };
  if (!hasContentEvidence(entry)) return { state: 'missing-source', reason: '作者资料尚不足以说明具体功能，待补充来源。' };
  if (entry.install.discovery?.status !== 'verified') return { state: 'review-required', reason: '插件来源或所选包身份尚待核实，暂不生成简介。' };
  if (job?.reviewReason && job.status === 'review-required') return { state: 'review-required', reason: job.reviewReason };
  if (job?.status === 'review-required' || job?.status === 'complete' || (job?.attempts ?? 0) >= 2) {
    return { state: 'review-required', reason: '已有结果未通过展示校验，或本资料版本已用完自动尝试次数，待复核。' };
  }
  if (job?.status === 'retry') return { state: 'retry', reason: '本次未取得有效结果，将在退避期结束且预算允许时再尝试。' };
  return { state: 'pending', reason: '本轮尚未完成生成，后续按榜单优先级和可用预算处理。' };
}

/** Inspect exactly what the publisher/frontend will show, including complete-but-hidden jobs. */
export function attachDescriptionCoverage(rankings: RankingsDocument, jobs: Record<string, DescriptionJob>) {
  const byId = new Map(Object.entries(jobs).map(([id, job]) => [id.toLowerCase(), job]));
  for (const entries of [...Object.values(rankings.rankings), ...Object.values(rankings.directories ?? {})]) {
    for (const entry of entries) {
      const status = missingDescriptionStatus(entry, byId.get(entry.fullName.toLowerCase()));
      if (status) entry.descriptionStatus = status;
      else delete entry.descriptionStatus;
    }
  }
  const boards = Object.fromEntries((['hot', 'rising'] as const).map(board => {
    const entries = rankings.rankings[board].slice(0, 100);
    const missing = entries.filter(entry => !hasPublishedChinese(entry)).map(entry => ({
      fullName: entry.fullName, rank: entry.rank, ...entry.descriptionStatus!,
    }));
    const stale = missing.filter(entry => entry.state === 'stale').length;
    return [board, { total: entries.length, covered: entries.length - missing.length,
      stale, available: entries.length - missing.length + stale, missing }];
  }));
  // Visibility does not grant paid backlog eligibility. Skills remain outside
  // boardDescriptionScope until a separate scope is explicitly enabled.
  const skills = rankings.directories?.skills ?? [];
  const states: Partial<Record<DescriptionStatus['state'], number>> = {};
  let missingSkills = 0;
  for (const entry of skills) {
    if (!entry.descriptionStatus) continue;
    missingSkills++;
    const state = entry.descriptionStatus.state;
    states[state] = (states[state] ?? 0) + 1;
  }
  const topSkills = skills.slice(0, 100);
  const topMissing = topSkills.filter(entry => entry.descriptionStatus).map(entry => ({
    fullName: entry.fullName, rank: entry.rank, ...entry.descriptionStatus!,
  }));
  return { generatedAt: rankings.generatedAt, snapshotDate: rankings.snapshotDate,
    scope: 'hot-rising-top100', unique: boardDescriptionScope(rankings).size, boards,
    directories: { skills: { total: skills.length, covered: skills.length - missingSkills, missing: missingSkills, states,
      top100: { total: topSkills.length, covered: topSkills.length - topMissing.length, missing: topMissing } } } };
}
