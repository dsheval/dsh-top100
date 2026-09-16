import { describe, expect, it, vi } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingEntry, RankingsDocument } from '../src/rankings.js';
import { boardDescriptionScope, attachDescriptionCoverage } from '../src/board-descriptions.js';
import { runBoardFirstDescriptions } from '../src/daily-board-descriptions.js';
import { descriptionSourceHash, type DescriptionJob } from '../src/description-jobs.js';
import { descriptionDisplayFor, descriptionFor, PENDING_DESCRIPTION_ZH } from '../src/description-rules.js';

const now = Date.parse('2026-09-15T00:00:00Z');
const result = { descriptionZh: '检索学术论文并提取引用，帮助整理研究资料。', tagsZh: ['文献检索'] };
function source(id: string, changes: Partial<DshPlugin> = {}): DshPlugin {
  return { id, fullName: id, name: id.split('/')[1], type: 'cordis-plugin', description: 'Search academic papers and retrieve citations.',
    descriptionZh: null, readmeSummary: 'Search papers, retrieve citations and export research documents.', topics: [], tags: [], stars: 1,
    install: { method: 'pnpm-profile', packageName: 'dsh-papers', discovery: { status: 'verified', kind: 'package', evidence: [] } },
    ...changes } as DshPlugin;
}
function ranking(hot: DshPlugin[], rising: DshPlugin[] = []): RankingsDocument {
  const entries = (rows: DshPlugin[]) => rows.map((source, index) => ({ ...source, rank: index + 1 })) as unknown as RankingEntry[];
  return { generatedAt: new Date(now).toISOString(), snapshotDate: '2026-09-15',
    rankings: { hot: entries(hot), rising: entries(rising), total: entries([...new Set([...hot, ...rising])]) },
    directories: { skills: [] } } as unknown as RankingsDocument;
}
function baseline(sources: DshPlugin[]) { return new Map(sources.map(s => [s.fullName.toLowerCase(), structuredClone(s)])); }

describe('current board descriptions', () => {
  it('uses at most the first 100 of each current board and deduplicates overlaps', () => {
    const rows = Array.from({ length: 105 }, (_, i) => source(`a/${i}`));
    const scope = boardDescriptionScope(ranking(rows, rows.slice(5)));
    expect(scope.size).toBe(105);
    expect(boardDescriptionScope(ranking(rows)).has('a/100')).toBe(false);
  });
  it('pays unchanged board backlog before a newly changed non-board source, never unchanged long tail', async () => {
    const tail = source('a/tail'), changed = source('a/changed'), board = source('a/today');
    const sources = [tail, changed, board], previous = baseline(sources);
    changed.description += ' Added patent search.';
    const calls: string[] = [], persist = vi.fn();
    const work = await runBoardFirstDescriptions(sources, previous, new Map(), {}, () => ranking([board]), {
      enabled: true, limit: 2, now, persist, worker: async entry => { calls.push(entry.id); return result; },
    });
    expect(calls).toEqual(['a/today', 'a/changed']);
    expect(work.boards.completed).toBe(1); expect(work.daily.completed).toBe(1);
    expect(persist).toHaveBeenCalled(); expect(tail.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
  });
  it('reuses valid Chinese, blocks holds, unverified identities, missing evidence and changed packages', async () => {
    const valid = source('a/valid', { descriptionZh: result.descriptionZh });
    const held = source('a/held'); held.install.packageName = '@deepseek-ai/dsh-root';
    const unverified = source('a/unverified'); unverified.install.discovery!.status = 'review-required';
    const empty = source('a/empty', { description: '', readmeSummary: null });
    const identity = source('a/identity');
    const sources = [valid, held, unverified, empty, identity], previous = baseline(sources);
    identity.install.packageName = 'another-package';
    const worker = vi.fn(async () => result);
    await runBoardFirstDescriptions(sources, previous, new Map(), {}, () => ranking(sources), {
      enabled: true, limit: 200, now, persist: () => {}, worker,
    });
    expect(worker).not.toHaveBeenCalled(); expect(valid.descriptionZh).toBe(result.descriptionZh);
  });
  it('retains backoff, caps same-source attempts at two and does not repeat a completed job', async () => {
    const entry = source('a/board'), previous = baseline([entry]), worker = vi.fn(async () => null);
    let jobs: Record<string, DescriptionJob> = {};
    for (const at of [now, now + 1000, now + 86_400_000, now + 4 * 86_400_000]) {
      jobs = (await runBoardFirstDescriptions([entry], previous, new Map(), jobs, () => ranking([entry]), {
        enabled: true, limit: 200, now: at, persist: () => {}, worker,
      })).jobs;
    }
    expect(worker).toHaveBeenCalledTimes(2);
    const done: DescriptionJob = { sourceHash: descriptionSourceHash(entry), status: 'complete', attempts: 1, descriptionZh: result.descriptionZh };
    const recovered = source('a/board');
    await runBoardFirstDescriptions([recovered], previous, new Map(), { [entry.id]: done }, () => ranking([recovered]), {
      enabled: true, limit: 200, now, persist: () => {}, worker,
    });
    expect(recovered.descriptionZh).toBe(result.descriptionZh); expect(worker).toHaveBeenCalledTimes(2);
  });
  it('with no budget/enablement or no baseline sends no requests while retaining missing reasons', async () => {
    for (const [enabled, old] of [[false, true], [true, false]] as const) {
      const entry = source('a/board'), worker = vi.fn(async () => result);
      await runBoardFirstDescriptions([entry], old ? baseline([entry]) : new Map(), new Map(), {}, () => ranking([entry]), {
        enabled, limit: 200, now, persist: () => {}, worker,
      });
      expect(worker).not.toHaveBeenCalled();
    }
  });
  it('persists invalid-output review immediately and does not pay for it again on subsequent days', async () => {
    const entry = source('a/board'), previous = baseline([entry]), invalid = new Set<string>();
    const worker = vi.fn(async () => { invalid.add(entry.id); return null; });
    let saved: Record<string, DescriptionJob> = {};
    await runBoardFirstDescriptions([entry], previous, new Map(), {}, () => ranking([entry]), {
      enabled: true, limit: 200, now, invalidOutputs: invalid, worker,
      persist: jobs => { saved = structuredClone(jobs); },
    });
    expect(saved[entry.id]).toMatchObject({ status: 'review-required', reviewLocked: true, attempts: 1 });
    await runBoardFirstDescriptions([entry], previous, new Map(), saved, () => ranking([entry]), {
      enabled: true, limit: 200, now: now + 10 * 86_400_000, worker, persist: () => {},
    });
    expect(worker).toHaveBeenCalledTimes(1);
  });
  it('publishes fresh lists with explicit reasons and counts actual display, not job completion', () => {
    const held = source('a/held'); held.install.packageName = '@deepseek-ai/dsh-root';
    const invalid = source('a/invalid', { descriptionZh: 'English only output' });
    const valid = source('a/valid', { descriptionZh: result.descriptionZh });
    const ranks = ranking([held, invalid, valid], [invalid]);
    const report = attachDescriptionCoverage(ranks, { [invalid.id]: { status: 'complete', attempts: 1, sourceHash: 'old' } });
    expect(report.boards.hot.covered).toBe(1); expect(report.boards.rising.covered).toBe(0);
    expect(report.boards.hot.missing).toHaveLength(2);
    expect(descriptionDisplayFor(ranks.rankings.hot[0])).toContain('中文简介待复核');
    expect(descriptionFor(ranks.rankings.hot[0])).toBe(PENDING_DESCRIPTION_ZH);
    expect(ranks.rankings.hot.map(x => x.fullName)).toEqual([held.id, invalid.id, valid.id]);
  });
});
