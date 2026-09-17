/** Bounded, free checks for the independently approved Skills Top100 backlog. */
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument } from './rankings.js';
import { githubFetch, fetchRawFile } from './github.js';
import { DISCOVERY_POLICY_VERSION } from './detect.js';
import { matchingDescriptionHold } from './content-source.js';
import { hasPublishedChinese } from './board-descriptions.js';
import type { SourceRefreshResult } from './board-source-refresh.js';

import { skillHash as hash, validSkillPath, skillDocument, currentSkillName } from './skill-evidence.js';
export { hasSkillSourceEvidence, restoreKnownSkillSource, currentSkillName } from './skill-evidence.js';
export function skillsDescriptionScope(rankings: RankingsDocument): Set<string> {
  return new Set((rankings.directories?.skills ?? []).slice(0, 100).map(entry => entry.fullName.toLowerCase()));
}
function hold(source: DshPlugin, now: number, reason: string): SourceRefreshResult {
  return { status: 'review-required', reason, content: 'review-required', source: { ...source,
    install: { ...source.install, discovery: { ...source.install.discovery,
      kind: 'skill', status: 'review-required', checkedAt: new Date(now).toISOString(), policyVersion: DISCOVERY_POLICY_VERSION,
      evidence: [...new Set([...(source.install.discovery?.evidence ?? []), `skill-source-held:${reason}`])] } } } };
}

/** Never substitute a first child Skill or product README for the selected identity. */
export async function refreshSkillSource(source: DshPlugin, now: number): Promise<SourceRefreshResult> {
  const fixedHold = matchingDescriptionHold(source);
  if (fixedHold) return hold(source, now, fixedHold.reason);
  if (source.type !== 'skill' || source.install.packageName || source.install.repositoryPath)
    return hold(source, now, '收录类型、所选包或子技能身份需要定向确认。');
  try {
    const repo = await githubFetch<{ full_name: string; default_branch: string; private?: boolean; visibility?: string; archived?: boolean; fork?: boolean }>(`/repos/${source.fullName}`);
    if (repo.private || repo.visibility === 'private' || repo.archived || repo.fork)
      return { status: 'excluded', reason: 'Repository no longer eligible for public collection.' };
    if (repo.full_name.toLowerCase() !== source.fullName.toLowerCase()) return hold(source, now, '仓库身份变化，待重新核实技能对象。');
    const head = await githubFetch<{ sha: string }>(`/repos/${source.fullName}/commits/${encodeURIComponent(repo.default_branch)}`);
    if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('Missing commit');
    const tree = await githubFetch<{ truncated?: boolean; tree: { path: string; type: string }[] }>(`/repos/${source.fullName}/git/trees/${head.sha}?recursive=1`);
    const paths = tree.tree.filter(item => item.type === 'blob' && validSkillPath(item.path)).map(item => item.path).sort();
    if (tree.truncated || paths.length > 40 || !paths.length)
      return hold(source, now, '技能文件缺失或目录超过有限核查范围，待明确所选技能路径。');
    const expectedName = currentSkillName(source);
    const oldProof = source.install.discovery?.skill;
    if (!expectedName && !(paths.length === 1 && paths[0] === 'SKILL.md'))
      return hold(source, now, '当前摘要未标明唯一技能名称，集合或子技能需先明确展示对象。');
    if (oldProof && !paths.includes(oldProof.path)) return hold(source, now, '已核实技能路径发生变化，待重新确认身份。');
    const matches: { path: string; document: string; name: string; summary: string }[] = [];
    // Read a bounded set at the same commit; multiple matching names remain ambiguous.
    for (const path of paths) {
      const document = await fetchRawFile(source.fullName, path, head.sha);
      if (document === null) return hold(source, now, '本轮技能文件未能完整读取，无法确认唯一身份。');
      const meta = skillDocument(document);
      if (meta && (!expectedName || meta.name === expectedName)) matches.push({ path, document, ...meta });
    }
    if (matches.length !== 1 || oldProof && matches[0].path !== oldProof.path)
      return hold(source, now, '技能名称或路径不唯一、不匹配或功能说明不足，待定向复核。');
    const { path, document, name, summary } = matches[0];
    if (oldProof && hash(document) !== oldProof.documentSha256)
      return hold(source, now, '已核实技能正文发生变化，需定向复核功能后恢复简介。');
    const refreshed: DshPlugin = { ...source, readmeSummary: summary, lastCheckedAt: new Date(now).toISOString(),
      install: { ...source.install, discovery: { status: 'verified', kind: 'skill', policyVersion: DISCOVERY_POLICY_VERSION,
        checkedAt: new Date(now).toISOString(), sourceRevision: head.sha,
        evidence: [`selected SKILL.md:${path}`,  'selected-skill-v1:frontmatter-name-and-description'],
        skill: { policy: 'selected-skill-v1', fullName: source.fullName.toLowerCase(), path, name,
          sourceRevision: head.sha, documentSha256: hash(document), summarySha256: hash(summary) } } } };
    // A fixed review may match old prose only; changing evidence cannot unfreeze it.
    const changedHold = matchingDescriptionHold(refreshed);
    return changedHold ? hold(source, now, changedHold.reason)
      : { status: 'verified', source: refreshed, content: 'ready', reason: 'Pinned selected SKILL.md identity and functional frontmatter verified.' };
  } catch { return hold(source, now, '本轮技能来源读取未完成，保留历史内容并暂停生成。'); }
}

export async function refreshSkillsSources(sources: DshPlugin[], rankings: () => RankingsDocument,
  options: { enabled: boolean; now: number; refresh?: typeof refreshSkillSource }) {
  const report: { fullName: string; status: string; reason: string }[] = [];
  if (!options.enabled) return report;
  // Freeze the current Top100: exclusions never expand this run into lower-ranked backlog.
  const scope = skillsDescriptionScope(rankings());
  const missing = new Set((rankings().directories?.skills ?? []).slice(0, 100)
    .filter(entry => !hasPublishedChinese(entry)).map(entry => entry.fullName.toLowerCase()));
  const tasks = sources.filter(source => source.type === 'skill' && scope.has(source.fullName.toLowerCase())
    && missing.has(source.fullName.toLowerCase()));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
    while (next < tasks.length) {
      const source = tasks[next++];
      let result: SourceRefreshResult;
      try { result = await (options.refresh ?? refreshSkillSource)(source, options.now); }
      catch { result = hold(source, options.now, '技能来源核查暂未完成，后续日常运行再核查。'); }
      const index = sources.indexOf(source);
      if (result.status === 'excluded') sources.splice(index, 1);
      else if (result.source) sources[index] = result.source;
      report.push({ fullName: result.status === 'excluded' ? '[excluded repository]' : source.fullName,
        status: result.status, reason: result.reason });
    }
  }));
  return report;
}
