import { describe, expect, it, vi } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingEntry, RankingsDocument } from '../src/rankings.js';
import examples from './fixtures/description-quality-20260916.json';
import reviews from '../../plugin/src/shared/reviewed-descriptions.json';
import { descriptionFor, descriptionQualityIssue, PENDING_DESCRIPTION_ZH } from '../../plugin/src/shared/description-rules.js';
import { extractJson, fallbackDescriptionZh } from '../src/llm.js';
import { descriptionSourceHash, hasChineseDescription, type DescriptionJob } from '../src/description-jobs.js';
import { prepareDailyDescriptions, updateDailyDescriptionCache } from '../src/daily-descriptions.js';
import { runBoardFirstDescriptions } from '../src/daily-board-descriptions.js';
import { attachDescriptionCoverage, hasPublishedChinese } from '../src/board-descriptions.js';
import { planCatalogEnrichment } from '../src/catalog-enrichment.js';
import type { ZhEntry } from '../src/zh-util.js';

const now = Date.parse('2026-09-16T03:00:00Z');
const valid = '在会话中检索研究资料，并整理附带来源的引用。';
// Keep the raw-quality gate independent of subsequently approved repairs.
const source = (example: typeof examples.cases[number], reviewed = false) => ({ ...structuredClone(example),
  fullName: reviewed ? example.fullName : `unreviewed/${example.name}`,
  id: reviewed ? example.fullName : `unreviewed/${example.name}`, categories: [] }) as unknown as DshPlugin;
function ranking(rows: DshPlugin[]): RankingsDocument {
  return { schemaVersion: 2, generatedAt: new Date(now).toISOString(), snapshotDate: '2026-09-16',
    rankings: { total: rows, hot: rows, rising: rows }, directories: { skills: [] } } as unknown as RankingsDocument;
}

describe('September 16 description regressions', () => {
  it.each(examples.cases)('does not accept $fullName as Chinese coverage or model output', example => {
    const entry = source(example);
    expect(descriptionQualityIssue(entry.descriptionZh)).toBeTruthy();
    expect(hasChineseDescription(entry.descriptionZh)).toBe(false);
    expect(extractJson(JSON.stringify({ descriptionZh: entry.descriptionZh, tagsZh: [] }))).toBeNull();
    expect(descriptionFor(entry as unknown as Parameters<typeof descriptionFor>[0], {})).toBe(PENDING_DESCRIPTION_ZH);
    expect(hasPublishedChinese(entry as unknown as RankingEntry)).toBe(false);
    expect(fallbackDescriptionZh(entry)).not.toBe(example.descriptionZh);
  });

  it('holds rejected current/market/cache/job content across restarts without resetting attempts or paying', async () => {
    for (const route of ['current', 'market', 'cache', 'job'] as const) {
      const rows = examples.cases.map(example => source(example));
      const previous = new Map(rows.map(entry => [entry.id.toLowerCase(), structuredClone(entry)]));
      const cache = new Map<string, ZhEntry>();
      let jobs: Record<string, DescriptionJob> = {};
      for (const entry of rows) {
        const text = entry.descriptionZh!;
        jobs[entry.id] = { sourceHash: descriptionSourceHash(entry), status: 'complete', attempts: 2,
          ...(route === 'job' ? { descriptionZh: text } : {}) };
        if (route === 'cache') cache.set(entry.id, { sourceHash: descriptionSourceHash(entry), descriptionZh: text, tagsZh: [] });
        if (route !== 'current') entry.descriptionZh = null;
        if (route !== 'market') previous.get(entry.id.toLowerCase())!.descriptionZh = null;
      }
      const worker = vi.fn(async () => ({ descriptionZh: valid, tagsZh: [] }));
      for (const day of [0, 1, 7]) {
        const work = await runBoardFirstDescriptions(rows, previous, cache, jobs, () => ranking(rows), {
          enabled: true, limit: 100, now: now + day * 86_400_000, worker, persist: () => {},
        });
        jobs = work.jobs;
        expect(work.boardsReady).toBe(0); expect(work.dailyReady).toBe(0);
        for (const [index, entry] of rows.entries()) {
          expect(entry.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
          expect(jobs[entry.id]).toMatchObject({ status: 'review-required', attempts: 2,
            rejectedDescriptionZh: examples.cases[index].descriptionZh });
          expect(cache.has(entry.id)).toBe(false);
        }
      }
      expect(worker).not.toHaveBeenCalled();
      const coverage = attachDescriptionCoverage(ranking(rows), jobs);
      expect(coverage.boards.hot.covered).toBe(0);
      expect(coverage.boards.hot.missing.every(row => row.state === 'review-required')).toBe(true);
    }
  });

  it('does not degrade fixed reviews after source changes or rebind their approved baselines', () => {
    const baseline = JSON.stringify(reviews);
    for (const example of examples.cases.filter(e => [8, 18, 32, 46, 79].includes(e.rank))) {
      const review = reviews[example.fullName.toLowerCase() as keyof typeof reviews];
      const current = source(example, true);
      current.readmeSummary = `${current.readmeSummary} Changed functionality requiring a new review.`;
      const previous = { ...structuredClone(current), description: review.sourceDescription,
        readmeSummary: review.sourceReadme, descriptionZh: review.descriptionZh };
      current.descriptionZh = review.descriptionZh;
      const plan = prepareDailyDescriptions([current], new Map([[current.id.toLowerCase(), previous]]), new Map(), {}, new Set(), now);
      expect(current.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
      expect(plan.jobs[current.id]).toMatchObject({ status: 'review-required' });
      expect(plan.ready).toHaveLength(0);
    }
    expect(JSON.stringify(reviews)).toBe(baseline);
  });

  it('keeps unchanged valid results and records the origin of new author/model results', async () => {
    const entry = source(examples.cases[3]);
    entry.descriptionZh = valid;
    const previous = new Map([[entry.id.toLowerCase(), structuredClone(entry)]]);
    const cache = new Map<string, ZhEntry>();
    const plan = prepareDailyDescriptions([entry], previous, cache, {}, new Set(), now);
    expect(entry.descriptionZh).toBe(valid); expect(plan.ready).toHaveLength(0);
    expect(plan.jobs[entry.id].origin).toBe('legacy');
    entry.descriptionZh = null; entry.description = valid;
    const authored = prepareDailyDescriptions([entry], new Map(), cache, {}, new Set(), now);
    expect(authored.jobs[entry.id].origin).toBe('author');
    updateDailyDescriptionCache([entry], cache, authored.jobs);
    expect(cache.get(entry.id)?.origin).toBe('author');
    entry.descriptionZh = null; entry.description = 'Search academic research and references.';
    const worker = vi.fn(async () => ({ descriptionZh: valid, tagsZh: [] }));
    const generated = await runBoardFirstDescriptions([entry], new Map([[entry.id.toLowerCase(), structuredClone(entry)]]), cache, {}, () => ranking([entry]),
      { enabled: true, limit: 1, now, worker, persist: () => {} });
    expect(worker).toHaveBeenCalledTimes(1);
    expect(generated.jobs[entry.id].origin).toBe('model');
    expect(cache.get(entry.id)?.origin).toBe('model');
  });

  it('also holds bad descriptions in the frozen catalog planner without opening a batch queue', () => {
    const rows = examples.cases.map(example => source(example));
    const first = planCatalogEnrichment(ranking(rows), undefined, now);
    const again = planCatalogEnrichment(first.document, first.state, now + 86_400_000);
    for (const plan of [first, again]) {
      expect(plan.ready.filter(task => task.kind === 'description')).toHaveLength(0);
      for (const entry of rows) expect(plan.state.jobs[entry.id.toLowerCase()].description.status).toBe('review-required');
    }
  });
});
