import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { openDatabase, importMarketData } from '../src/database.js';
import { buildRankings } from '../src/rankings.js';
import reviews from '../../plugin/src/shared/reviewed-descriptions.json';
import holds from '../config/editorial-holds.json';
import { descriptionFor, PENDING_DESCRIPTION_ZH } from '../../plugin/src/shared/description-rules.js';
import { prepareDailyDescriptions } from '../src/daily-descriptions.js';
import { planDailyCategories } from '../src/daily-categories.js';
import { bindCategoryAssignments } from '../src/categories.js';
import { contentSourceHash } from '../src/content-source.js';
import { mergeCatalogContent } from '../src/merge-catalog-content.js';
import { planCatalogEnrichment } from '../src/catalog-enrichment.js';
import type { DshPlugin, MarketData } from '@dsh-top100/schema';
import type { RankingsDocument, RankingEntry } from '../src/rankings.js';
const now = Date.parse('2026-09-10T08:00:00Z');
function fixture() {
  const id = 'whitelonng/dshcode';
  const hold = holds[id], review = reviews[id];
  const source = { id, fullName: id, name: 'dshcode', type: review.sourceType, description: hold.sourceDescription,
    readmeSummary: hold.sourceReadme, install: structuredClone(hold.sourceInstall), topics: [], tags: ['桌面'], stars: 100,
    descriptionZh: '将整个桌面产品的会话管理和界面功能错误归给当前收录的运行时包。' } as unknown as DshPlugin;
  source.categories = bindCategoryAssignments(source, [{ id: 'appearance', confidence: 0.95, evidence: '根产品桌面界面', source: 'manual' }]);
  const rankings = { schemaVersion: 2, generatedAt: '', snapshotDate: '', rankings: {
    total: [structuredClone(source) as unknown as RankingEntry], hot: [], rising: [] }, directories: { skills: [] } } as unknown as RankingsDocument;
  return { source, rankings };
}
describe('withdrawn source-bound content', () => {
  it('blocks old same-source content and completed caches in both daily queues', () => {
    const { source } = fixture(), old = structuredClone(source);
    const hash = contentSourceHash(source, 'description');
    const plan = prepareDailyDescriptions([source], new Map([[source.id, old]]), new Map([[source.id,
      { sourceHash: hash, descriptionZh: old.descriptionZh!, tagsZh: [] }]]), { [source.id]: {
      sourceHash: hash, status: 'complete', attempts: 1, descriptionZh: old.descriptionZh! } }, new Set(), now);
    expect(source.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
    expect(plan.jobs[source.id].status).toBe('review-required');
    expect(plan.ready).toEqual([]);
    const categories = planDailyCategories([source], { now });
    expect(source.categories).toEqual([]);
    expect(categories.state.jobs[source.id].status).toBe('review-required');
    expect(categories.ready).toEqual([]);
  });
  it('withdraws already valid-looking content during merging and frozen replanning', () => {
    const { source, rankings } = fixture();
    const market = { schemaVersion: 2, generatedAt: '', plugins: [source], packs: [] } as MarketData;
    const merged = mergeCatalogContent(market, rankings).market.plugins[0];
    expect(merged.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
    expect(merged.categories).toEqual([]);
    const plan = planCatalogEnrichment(rankings, undefined, now);
    expect(plan.document.rankings.total[0].descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
    expect(plan.document.rankings.total[0].categories).toEqual([]);
    expect(plan.state.jobs[source.id].description.status).toBe('review-required');
    expect(plan.state.jobs[source.id].categories.status).toBe('review-required');
    expect(plan.ready).toEqual([]);
  });
  it('preserves a withdrawal in all ranking lists even if legacy SQLite contains the old Chinese', () => {
    const { source } = fixture();
    Object.assign(source, { owner: 'whitelonng', repo: 'dshcode', forks: 1, openIssues: 0,
      language: null, homepage: null, license: null, sources: ['test'], categories: [],
      pushedAt: '2026-09-10T00:00:00Z', createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-10T00:00:00Z', lastCheckedAt: '2026-09-10T00:00:00Z' });
    const db = openDatabase({ path: ':memory:' });
    const dir = mkdtempSync(resolve(tmpdir(), 'withdrawal-ranking-'));
    const configPath = resolve(dir, 'ranking.json');
    const config = JSON.parse(readFileSync(resolve('../config/ranking.json'), 'utf8'));
    writeFileSync(configPath, JSON.stringify({ ...config, excludedRepositories: {} }));
    try {
      importMarketData(db, { schemaVersion: 2, generatedAt: '2026-09-10T00:00:00Z', plugins: [source] });
      const excluded = buildRankings(db, '2026-09-10', resolve('../config/ranking.json'));
      for (const list of Object.values(excluded.rankings)) expect(list).toEqual([]);
      // Withdrawal must also remain effective independently of ranking exclusion.
      const rankings = buildRankings(db, '2026-09-10', configPath);
      for (const list of Object.values(rankings.rankings)) {
        expect(list[0].descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
        expect(list[0].categories).toEqual([]);
      }
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('hides withdrawn text in old public snapshots without suspending a changed package identity', () => {
    const { source } = fixture();
    const entry = { ...source, descriptionZh: source.descriptionZh! };
    expect(descriptionFor(entry, reviews)).toBe(PENDING_DESCRIPTION_ZH);
    const updated = { ...entry, install: { ...entry.install, packageName: 'new-verified-package' },
      descriptionZh: '为当前重新核对的插件提供有来源依据的中文功能介绍。' };
    expect(descriptionFor(updated, reviews)).toBe(updated.descriptionZh);
  });
});
