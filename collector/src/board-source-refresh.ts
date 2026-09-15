import { refreshCachedInstallEvidence } from "./install-cache.js";
/** Read-only, bounded source refresh for today's two boards, before paid work. */
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument } from './rankings.js';
import { boardDescriptionScope, hasPublishedChinese } from './board-descriptions.js';
import { detectPlugin, detectNeedsConfig, DISCOVERY_POLICY_VERSION, ReviewedTargetValidationError } from './detect.js';
import { githubFetch, fetchRepoRoot, fetchRawFile } from './github.js';
import { summarizeSelectedReadme } from './reviewed-summary.js';
import { selectedReadmeEvidence, hasSelectedReadmeEvidence } from './readme-evidence.js';
import { checkReviewedFunctionEvidence } from './reviewed-evidence.js';
import { applyFunctionEvidenceCheck } from './reviewed-evidence-state.js';
import { PENDING_DESCRIPTION_ZH } from '../../plugin/src/shared/description-rules.js';

export interface SourceRefreshResult {
  status: 'verified' | 'review-required' | 'excluded';
  source?: DshPlugin;
  reason: string;
}
function held(source: DshPlugin, now: number, reason: string, invalid = false): SourceRefreshResult {
  const old = source.install.discovery;
  return { status: 'review-required', reason, source: { ...source,
    ...(invalid ? { descriptionZh: PENDING_DESCRIPTION_ZH, categories: [] } : {}),
    install: { ...source.install, ...(invalid ? { commands: undefined, commandSource: undefined, assessment: undefined } : {}),
      discovery: { ...(old ?? { kind: 'host', policyVersion: DISCOVERY_POLICY_VERSION, checkedAt: source.lastCheckedAt }),
        status: 'review-required', evidence: [...new Set([...(old?.evidence ?? []),
          `${invalid ? 'selected-package-invalid:' : 'board-source-unavailable:'}${reason}`])] } } } };
}

/** Pin one current commit for the manifest, README and reviewed source files.
 * No package installation/execution, root README substitution or LLM calls.
 */
export async function refreshBoardSource(source: DshPlugin, now: number): Promise<SourceRefreshResult> {
  try {
    const repo = await githubFetch<{ private?: boolean; visibility?: string; archived?: boolean; fork?: boolean; default_branch: string; full_name: string }>(`/repos/${source.fullName}`);
    if (repo.private || repo.visibility === 'private' || repo.archived || repo.fork) {
      return { status: 'excluded', reason: 'Repository no longer eligible for public collection.' };
    }
    if (repo.full_name.toLowerCase() !== source.fullName.toLowerCase()) return held(source, now, '仓库身份发生变化，待重新确认所选包。');
    const head = await githubFetch<{ sha: string }>(`/repos/${source.fullName}/commits/${encodeURIComponent(repo.default_branch)}`);
    if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('Missing commit');
    const root = await fetchRepoRoot(source.fullName, head.sha);
    const detection = await detectPlugin(source.fullName, root, head.sha, { primaryOnly: true, reviewedTarget: {
      packageName: source.install.packageName!, repositoryPath: source.install.repositoryPath ?? null,
    } });
    const path = detection.pluginPath ? `${detection.pluginPath}/README.md` : 'README.md';
    const document = await fetchRawFile(source.fullName, path, head.sha);
    const summary = document === null ? null : summarizeSelectedReadme(source.fullName, source.install, document);
    const checkedAt = new Date(now).toISOString();
    const install = refreshCachedInstallEvidence({ fullName: source.fullName, ...source.install },
      { commands: source.install.commands ?? [], source: source.install.commandSource ?? 'template' }, document).installParsed;
    // Commands remain an independent assessment. Do not derive a sibling package
    // install command from examples in a package README during evidence refresh.
    let refreshed: DshPlugin = { ...source, readmeSummary: summary, lastCheckedAt: checkedAt,
      install: { ...source.install, commands: install.commands.length ? install.commands : undefined,
        commandSource: install.source === 'template' ? undefined : install.source, needsConfig: document === null ? source.install.needsConfig : detectNeedsConfig(document),
        discovery: { status: 'verified', kind: detection.kind!, policyVersion: DISCOVERY_POLICY_VERSION,
          checkedAt, sourceRevision: head.sha, evidence: detection.evidence,
          ...(document !== null && summary !== null ? { readme: selectedReadmeEvidence(source.fullName,
            detection.packageName, detection.pluginPath, head.sha, document, summary) } : {}) } } };
    const check = await checkReviewedFunctionEvidence(source.fullName, refreshed.install,
      path => fetchRawFile(source.fullName, path, head.sha));
    refreshed = applyFunctionEvidenceCheck(refreshed, source, check);
    return { status: refreshed.install.discovery!.status, source: refreshed,
      reason: check.status === 'not-required' || check.status === 'matched' ? 'Selected package and scoped source refreshed.' : check.reason };
  } catch (error) {
    return error instanceof ReviewedTargetValidationError
      ? held(source, now, '当前选中包未通过插件声明或包身份核验，需纠正收录对象。', true)
      : held(source, now, '本轮来源读取未完成，保留历史证据，后续重试。');
  }
}

export async function refreshBoardSources(sources: DshPlugin[], rankings: () => RankingsDocument,
  options: { enabled: boolean; now: number; refresh?: typeof refreshBoardSource; limit?: number }) {
  const report: { fullName: string; status: string; reason: string }[] = [];
  if (!options.enabled) return report;
  const limit = options.limit ?? 200;
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new Error('Invalid board source refresh limit');
  const attempted = new Set<string>();
  // Exclusions can admit new board entries. Recompute within the same total cap.
  while (attempted.size < limit) {
    const preview = rankings(), scope = boardDescriptionScope(preview);
    const missing = new Set([...preview.rankings.hot, ...preview.rankings.rising]
      .filter(entry => !hasPublishedChinese(entry)).map(entry => entry.fullName.toLowerCase()));
    const tasks = sources.filter(source => source.type === 'cordis-plugin' && !!source.install.packageName
      && scope.has(source.fullName.toLowerCase()) && !attempted.has(source.fullName.toLowerCase())
      && (missing.has(source.fullName.toLowerCase()) || source.install.discovery?.status !== 'verified'
        || source.install.discovery.kind === 'host'
        || !!source.install.repositoryPath && !!source.readmeSummary && !hasSelectedReadmeEvidence(source)))
      .slice(0, limit - attempted.size);
    if (!tasks.length) break;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (next < tasks.length) {
        const source = tasks[next++]; attempted.add(source.fullName.toLowerCase());
        let result: SourceRefreshResult;
        try { result = await (options.refresh ?? refreshBoardSource)(source, options.now); }
        catch { result = held(source, options.now, '本轮来源读取未完成，保留历史证据，后续重试。'); }
        const index = sources.indexOf(source);
        if (result.status === 'excluded') sources.splice(index, 1);
        else if (result.source) sources[index] = result.source;
        report.push({ fullName: result.status === 'excluded' ? '[excluded repository]' : source.fullName,
          status: result.status, reason: result.reason });
      }
    }));
  }
  return report;
}
