import { describe, expect, it, vi } from 'vitest';
import type { RankingEntry, RankingsDocument } from '../src/rankings.js';
import type { DshPlugin } from '@dsh-top100/schema';
import { publishDescription } from '../src/published-description.js';
import { lastVerifiedDescription } from '../src/description-continuity.js';
import { hasPublishedChinese, attachDescriptionCoverage } from '../src/board-descriptions.js';
import { matchingDescriptionHold } from '../src/content-source.js';
import { reviewedCategories } from '../src/editorial.js';
import { runBoardFirstDescriptions } from '../src/daily-board-descriptions.js';
import { toSnapshotSearchEntry, toSearchEntry } from '../src/search-index.js';
import { PENDING_DESCRIPTION_ZH } from '../src/description-rules.js';
import reviews from '../config/reviewed-descriptions.json';

vi.mock('../config/reviewed-descriptions.json', () => ({ default: {
  'continuity/plugin': { sourceType: 'cordis-plugin', sourceInstall: { packageName: 'continuity-plugin', repositoryPath: null },
    sourceDescription: 'Search papers.', sourceReadme: 'Search academic papers and export citations.',
    sourceDocumentHashes: ['old-document'], enforceSourceMatch: true,
    descriptionZh: '检索学术论文并导出引用，帮助整理研究资料。', reviewedAt: '2026-09-16' },
} }));
const review = () => (reviews as any)['continuity/plugin'];
function source(): RankingEntry {
  return { fullName: 'continuity/plugin', id: 'continuity/plugin', name: 'plugin', type: 'cordis-plugin',
    description: 'Search papers.', readmeSummary: 'Search academic papers and export citations.',
    descriptionZh: PENDING_DESCRIPTION_ZH, categories: [], topics: [], tags: [], rank: 1,
    install: { method: 'pnpm-profile', packageName: 'continuity-plugin', discovery: { status: 'verified', kind: 'package',
      evidence: [], readme: { documentSha256: 'new-document' } } } } as unknown as RankingEntry;
}
function document(entry: RankingEntry): RankingsDocument {
  return { generatedAt: '2026-09-17T00:00:00Z', snapshotDate: '2026-09-17',
    rankings: { total: [entry], hot: [entry], rising: [entry] }, directories: { skills: [] } } as unknown as RankingsDocument;
}

describe('last verified plugin description continuity', () => {
  it('retains dated text after document changes without clearing the source hold or counting as verified', () => {
    const entry = source();
    const report = attachDescriptionCoverage(document(entry), {});
    expect(report.boards.hot).toMatchObject({ covered: 0, stale: 1, available: 1 });
    expect(matchingDescriptionHold(entry)).not.toBeNull();
    expect(hasPublishedChinese(entry)).toBe(false);
    const published = publishDescription(entry);
    expect(published).toMatchObject({ descriptionPolicy: 'server-v1', descriptionZh: review().descriptionZh,
      descriptionStatus: { state: 'stale', reviewedAt: '2026-09-16' } });
    expect(publishDescription(published)).toEqual(published);
    expect(toSnapshotSearchEntry(entry).descriptionStatus).toEqual(published.descriptionStatus);
    expect(toSearchEntry(entry).descriptionZh).toEqual(published.descriptionZh);
    expect(reviewedCategories(entry)).toBeNull();
  });
  it('preserves last verified text on an inconclusive read and restores fresh only after exact proof matches', () => {
    const entry = source(); entry.install.discovery!.status = 'review-required';
    entry.install.discovery!.evidence.push('board-source-unavailable:timeout');
    expect(publishDescription(entry).descriptionStatus?.state).toBe('stale');
    entry.install.discovery!.status = 'verified'; entry.install.discovery!.readme!.documentSha256 = 'old-document';
    entry.descriptionStatus = { state: 'stale', reviewedAt: '2026-09-16', reason: 'old' };
    const coverage = attachDescriptionCoverage(document(entry), {});
    expect(coverage.boards.hot).toMatchObject({ covered: 1, stale: 0, available: 1 });
    expect(publishDescription(entry).descriptionStatus).toBeUndefined();
  });
  it('does not pay, complete jobs or change classifications just because old text can be displayed', async () => {
    const entry = source() as unknown as DshPlugin;
    const worker = vi.fn(async () => null);
    const result = await runBoardFirstDescriptions([entry], new Map([[entry.id, structuredClone(entry)]]), new Map(), {},
      () => document(entry as unknown as RankingEntry), { enabled: true, limit: 200,
        now: Date.parse('2026-09-17T00:00:00Z'), persist: () => {}, worker });
    expect(worker).not.toHaveBeenCalled();
    expect(result.jobs[entry.id].status).toBe('review-required');
    expect(entry.categories).toEqual([]);
  });
  it.each(['identity', 'directory', 'invalid', 'skill', 'unbound', 'withdrawn', 'contradiction', 'date', 'empty'])
    ('keeps %s cases hidden even when a caller injects stale text', condition => {
      const entry = source(), original = structuredClone(review());
      try {
        if (condition === 'identity') entry.install.packageName = 'another';
        if (condition === 'directory') entry.install.repositoryPath = 'new/path';
        if (condition === 'invalid') entry.install.discovery!.evidence.push('selected-package-invalid:wrong package');
        if (condition === 'skill') entry.type = 'skill';
        if (condition === 'unbound') delete review().sourceInstall;
        if (condition === 'withdrawn') review().suspended = true;
        if (condition === 'contradiction') review().reviewRequiredReason = 'Known incorrect capability.';
        if (condition === 'date') review().reviewedAt = '2026-02-30';
        if (condition === 'empty') review().descriptionZh = '';
        entry.descriptionZh = '恶意注入的无来源旧简介，不能当作已核实结果。';
        entry.descriptionStatus = { state: 'stale', reviewedAt: '2026-09-17', reason: 'untrusted' };
        expect(lastVerifiedDescription(entry)).toBeNull();
        expect(publishDescription(entry).descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
        expect(publishDescription(entry).descriptionStatus?.state).toBe('review-required');
      } finally { Object.keys(review()).forEach(key => delete review()[key]); Object.assign(review(), original); }
    });
});
