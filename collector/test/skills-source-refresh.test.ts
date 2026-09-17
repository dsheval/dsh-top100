import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument } from '../src/rankings.js';
import { refreshSkillSource, refreshSkillsSources, hasSkillSourceEvidence, restoreKnownSkillSource, currentSkillName } from '../src/skills-source-refresh.js';
import { githubFetch, fetchRawFile } from '../src/github.js';
import { runBoardFirstDescriptions } from '../src/daily-board-descriptions.js';
import { sameDescriptionSource } from '../src/content-source.js';
import { bindDailySourceJob } from '../src/daily-model-scope.js';
import { descriptionSourceHash, type DescriptionJob } from '../src/description-jobs.js';
vi.mock('../src/github.js', () => ({ githubFetch: vi.fn(), fetchRawFile: vi.fn(), fetchRepoRoot: vi.fn() }));
const commit = 'a'.repeat(40), now = Date.parse('2026-09-17T00:00:00Z');
const doc = '---\nname: papers\ndescription: Search academic papers and retrieve complete citations.\n---\n# Usage\nSearch papers.';
const chinese = { descriptionZh: '检索学术论文并提取引用，帮助整理研究资料。', tagsZh: ['文献检索'] };
const source = (id = 'a/project'): DshPlugin => ({ id, fullName: id, name: id.split('/')[1], type: 'skill', stars: 1,
  description: 'Root product marketing must not reach selected Skill input.', descriptionZh: null,
  readmeSummary: 'SKILL.md: name: papers description: Search academic papers and retrieve complete citations. README: Root product.',
  tags: [], topics: [], install: { method: 'skills-add', discovery: { kind: 'skill', status: 'review-required',
    checkedAt: 'old', policyVersion: 6, evidence: ['historical'] } } } as DshPlugin);
const ranking = (skills: DshPlugin[], hot: DshPlugin[] = []): RankingsDocument => ({ rankings: { hot, rising: [], total: hot },
  directories: { skills: skills.map((entry, i) => ({ ...entry, rank: i + 1 })) } } as unknown as RankingsDocument);
const baseline = (rows: DshPlugin[]) => new Map(rows.map(row => [row.fullName.toLowerCase(), structuredClone(row)]));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(githubFetch).mockImplementation(async path => path.includes('/commits/') ? { sha: commit }
    : path.includes('/git/trees/') ? { tree: [{ path: 'skills/papers/SKILL.md', type: 'blob' }] }
      : { full_name: 'a/project', default_branch: 'main' });
  vi.mocked(fetchRawFile).mockResolvedValue(doc);
});
describe('selected Skills evidence', () => {
  it('pins a uniquely named child Skill and never reads the product README', async () => {
    const result = await refreshSkillSource(source(), now);
    expect(result.status).toBe('verified'); expect(hasSkillSourceEvidence(result.source!)).toBe(true);
    expect(result.source!.install.discovery!.skill).toMatchObject({ path: 'skills/papers/SKILL.md', name: 'papers', sourceRevision: commit });
    expect(fetchRawFile).toHaveBeenCalledExactlyOnceWith('a/project', 'skills/papers/SKILL.md', commit);
    expect(result.source!.readmeSummary).not.toContain('Root');
    expect(currentSkillName(source())).toBe('papers');
  });
  it('holds duplicate names, truncated scans, absent identity, insufficient frontmatter and unavailable documents', async () => {
    const malformed = ['---\nname: papers\ndescription: Install this package\n---', 'no frontmatter'];
    for (const document of malformed) {
      vi.mocked(fetchRawFile).mockResolvedValue(document);
      expect((await refreshSkillSource(source(), now)).status).toBe('review-required');
    }
    vi.mocked(fetchRawFile).mockResolvedValue(doc);
    vi.mocked(githubFetch).mockImplementation(async path => path.includes('/commits/') ? { sha: commit }
      : path.includes('/git/trees/') ? { tree: [{ path: 'a/SKILL.md', type: 'blob' }, { path: 'b/SKILL.md', type: 'blob' }] }
        : { full_name: 'a/project', default_branch: 'main' });
    expect((await refreshSkillSource(source(), now)).status).toBe('review-required');
    const noName = source(); noName.readmeSummary = 'Skill collection for a product.';
    expect((await refreshSkillSource(noName, now)).status).toBe('review-required');
    vi.mocked(fetchRawFile).mockResolvedValue(null);
    expect((await refreshSkillSource(source(), now)).status).toBe('review-required');
    vi.mocked(githubFetch).mockImplementation(async path => path.includes('/commits/') ? { sha: commit }
      : path.includes('/git/trees/') ? { truncated: true, tree: [] } : { full_name: 'a/project', default_branch: 'main' });
    expect((await refreshSkillSource(source(), now)).status).toBe('review-required');
  });
  it('preserves an explicit fixed hold before reading any remote source', async () => {
    const held = source('anbeime/skill');
    expect((await refreshSkillSource(held, now)).status).toBe('review-required');
    expect(fetchRawFile).not.toHaveBeenCalled();
  });
  it('restores unchanged selected summaries and does not reset them to the collector mixed README', async () => {
    const proven = (await refreshSkillSource(source(), now)).source!;
    const collected = source(); collected.install.discovery!.status = 'verified';
    expect(restoreKnownSkillSource(collected, proven, 'skills/papers/SKILL.md', doc)).toBe(true);
    expect(collected.readmeSummary).toBe(proven.readmeSummary); expect(hasSkillSourceEvidence(collected)).toBe(true);
    const bodyChanged = source();
    expect(restoreKnownSkillSource(bodyChanged, proven, 'skills/papers/SKILL.md', doc + '\n# New functions')).toBe(false);
    expect(bodyChanged.install.discovery!.status).toBe('review-required');
    const changed = source();
    expect(restoreKnownSkillSource(changed, proven, 'skills/papers/SKILL.md', doc.replace('Search academic', 'Translate academic'))).toBe(false);
    expect(changed.install.discovery!.status).toBe('review-required');
    expect(changed.install.discovery!.skill!.name).toBe('papers');
  });
  it('ignores root marketing changes only for proven same Skill identity and function', async () => {
    const proven = (await refreshSkillSource(source(), now)).source!;
    proven.descriptionZh = chinese.descriptionZh;
    const changed = structuredClone(proven); changed.description = 'A new root product marketing slogan.';
    expect(sameDescriptionSource(changed, proven)).toBe(true);
    const previous = baseline([proven]), worker = vi.fn(async () => chinese);
    changed.descriptionZh = null;
    await runBoardFirstDescriptions([changed], previous, new Map(), {}, () => ranking([changed]), {
      enabled: true, skillsEnabled: true, limit: 100, now, worker, persist: () => {} });
    expect(changed.descriptionZh).toBe(chinese.descriptionZh); expect(worker).not.toHaveBeenCalled();
    changed.install.discovery!.skill!.path = 'another/SKILL.md';
    expect(sameDescriptionSource(changed, proven)).toBe(false);
    expect(descriptionSourceHash(changed)).not.toBe(descriptionSourceHash(proven));
  });
  it('does not clear a changed-document hold during the later free source refresh', async () => {
    const proven = (await refreshSkillSource(source(), now)).source!;
    const collected = source();
    const changedDocument = doc + '\n# New functions\nUpload the research files.';
    expect(restoreKnownSkillSource(collected, proven, 'skills/papers/SKILL.md', changedDocument)).toBe(false);
    vi.mocked(fetchRawFile).mockResolvedValue(changedDocument);
    const refreshed = await refreshSkillSource(collected, now);
    expect(refreshed.status).toBe('review-required');
    expect(refreshed.source!.install.discovery!.skill).toEqual(proven.install.discovery!.skill);
    const worker = vi.fn(async () => chinese);
    await runBoardFirstDescriptions([refreshed.source!], baseline([proven]), new Map(), {}, () => ranking([refreshed.source!]), {
      enabled: true, skillsEnabled: true, limit: 100, now, worker, persist: () => {} });
    expect(worker).not.toHaveBeenCalled();
  });
  it('checks only missing current top100 and limits concurrent readers to three', async () => {
    const rows = Array.from({ length: 105 }, (_, i) => source(`a/${i}`));
    rows[0].descriptionZh = chinese.descriptionZh;
    let active = 0, peak = 0;
    const refresh = vi.fn(async (entry: DshPlugin) => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
      return { status: 'review-required' as const, source: entry, reason: 'fixture' }; });
    await refreshSkillsSources(rows, () => ranking(rows), { enabled: false, now, refresh }); expect(refresh).not.toHaveBeenCalled();
    const report = await refreshSkillsSources(rows, () => ranking(rows), { enabled: true, now, refresh });
    expect(report).toHaveLength(99); expect(peak).toBeLessThanOrEqual(3);
    expect(refresh.mock.calls.some(([row]) => row.id === 'a/100')).toBe(false);
  });
});
describe('Skills share the board description runner', () => {
  it('does not turn evidence migration into category or general daily backlog eligibility', async () => {
    const original = source(), previous = baseline([original]);
    const skill = (await refreshSkillSource(original, now)).source!;
    expect(bindDailySourceJob(skill, previous, undefined, {})).toBe(false);
    const worker = vi.fn(async () => chinese);
    await runBoardFirstDescriptions([skill], previous, new Map(), {}, () => ranking([skill]), {
      enabled: true, skillsEnabled: true, limit: 100, now, worker, persist: () => {} });
    expect(worker).toHaveBeenCalledTimes(1);
  });
  it('requires opt-in plus fresh pinned evidence and shares one total request limit', async () => {
    const skill = (await refreshSkillSource(source(), now)).source!;
    const board = { ...source('a/plugin'), type: 'cordis-plugin', install: { method: 'pnpm-profile', discovery: { status: 'verified', evidence: [] } } } as DshPlugin;
    const rows = [skill, board], previous = baseline(rows), worker = vi.fn(async () => chinese);
    await runBoardFirstDescriptions(rows, previous, new Map(), {}, () => ranking([skill], [board]), {
      enabled: true, skillsEnabled: true, limit: 1, now, worker, persist: () => {} });
    expect(worker).toHaveBeenCalledTimes(1);
    const unverified = source(); unverified.install.discovery!.status = 'verified';
    await runBoardFirstDescriptions([unverified], baseline([unverified]), new Map(), {}, () => ranking([unverified]), {
      enabled: true, skillsEnabled: true, limit: 100, now, worker, persist: () => {} });
    expect(worker).toHaveBeenCalledTimes(1);
  });
  it('reuses valid Chinese, blocks tail backlog, retry exhaustion, review locks and stale checks', async () => {
    const good = (await refreshSkillSource(source(), now)).source!;
    for (const mode of ['disabled', 'valid', 'stale', 'exhausted', 'locked', 'tail'] as const) {
      const row = structuredClone(good), previous = baseline([row]), worker = vi.fn(async () => chinese);
      const old: Record<string, DescriptionJob> = {};
      if (mode === 'valid') row.descriptionZh = chinese.descriptionZh;
      if (mode === 'stale') row.install.discovery!.checkedAt = '2026-09-16T00:00:00Z';
      if (mode === 'exhausted' || mode === 'locked') old[row.id] = { sourceHash: descriptionSourceHash(row), status: 'retry',
        attempts: mode === 'exhausted' ? 2 : 1, ...(mode === 'locked' ? { reviewLocked: true } : {}) };
      await runBoardFirstDescriptions([row], previous, new Map(), old, () => ranking(mode === 'tail' ? [] : [row]), {
        enabled: true, skillsEnabled: mode !== 'disabled', limit: 200, now, worker, persist: () => {} });
      expect(worker).not.toHaveBeenCalled();
    }
  });
});
