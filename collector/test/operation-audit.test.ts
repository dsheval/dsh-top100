import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { auditPublication, readBudgetHealth } from '../src/operation-audit.js';
import { publishRankings } from '../src/publish-rankings.js';
import type { RankingsDocument } from '../src/rankings.js';
const dirs: string[] = [];
function fixture(missing = false) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-operation-')); dirs.push(dir);
  const rows = Array.from({ length: 6 }, (_, i) => ({ rank: i + 1, totalRank: i + 1, fullName: `fixture/entry-${i}`, name: `entry-${i}`, owner: 'fixture',
    type: 'cordis-plugin', description: 'Search project documents.', descriptionZh: missing ? null : '搜索项目文档并整理引用资料。', readmeSummary: 'Search project documents.',
    stars: 100 - i, dailyStars: 1, weeklyStars: 7, hotScore: 100 - i, openIssues: 0, language: 'TypeScript', license: 'MIT',
    topics: [], tags: [], categories: [], sources: ['github'], install: { method: 'pnpm-profile', needsConfig: false }, url: `https://github.com/fixture/entry-${i}`,
    pushedAt: '2026-09-16T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z' }));
  const document = { schemaVersion: 2, generatedAt: '2026-09-16T00:00:00Z', snapshotDate: '2026-09-16',
    definitions: { total: 'total', hot: 'hot', rising: 'rising' }, categories: [], rankings: { total: rows, hot: rows, rising: rows }, directories: { skills: [] } } as unknown as RankingsDocument;
  const manifest = publishRankings(document, dir);
  const transport: typeof fetch = async input => new Response(readFileSync(join(dir, new URL(String(input)).pathname.slice('/data/'.length))));
  return { dir, manifest, transport };
}
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
describe('publication acceptance', () => {
  it('marks actual published board gaps for time-based escalation and retains the broad coverage warning', async () => {
    const { dir, transport } = fixture(true);
    const report = await auditPublication({ publicDirectory: dir, expectedDate: '2026-09-16', publicOrigin: 'https://public.example', transport });
    const gaps = report.issues.filter(issue => issue.key.startsWith('description:'));
    expect(gaps).toHaveLength(6);
    expect(gaps.every(issue => issue.affectsBoard === true && issue.severity === 'info')).toBe(true);
    expect(report.issues.filter(issue => issue.key.startsWith('coverage:')).every(issue => issue.severity === 'warning')).toBe(true);
  });
  it('verifies all local assets and the matching public manifest and boards', async () => {
    const { dir, transport, manifest } = fixture();
    const report = await auditPublication({ publicDirectory: dir, expectedDate: '2026-09-16', publicOrigin: 'https://public.example', transport });
    expect(report.snapshotId).toBe(manifest.snapshotId); expect(report.publicVerified).toBe(true);
    expect(report.localAssetsVerified).toBeGreaterThan(3); expect(report.boards.hot.covered).toBe(6);
  });
  it('detects stale public content even when HTTP succeeds', async () => {
    const { dir, transport, manifest } = fixture();
    const stale: typeof fetch = async (input, init) => String(input).endsWith('manifest.json') ? new Response(JSON.stringify({ ...manifest, snapshotId: 'yesterday' })) : transport(input, init);
    await expect(auditPublication({ publicDirectory: dir, expectedDate: '2026-09-16', publicOrigin: 'https://public.example', transport: stale })).rejects.toThrow('public-manifest-mismatch');
  });
  it('detects asset tampering, stale dates, and local-only checks cannot claim public success', async () => {
    const { dir, manifest } = fixture();
    expect((await auditPublication({ publicDirectory: dir, expectedDate: '2026-09-16' })).publicVerified).toBe(false);
    await expect(auditPublication({ publicDirectory: dir, expectedDate: '2026-09-17' })).rejects.toThrow('snapshot-date-mismatch');
    writeFileSync(join(dir, manifest.datasets.hot.url.slice('/data/'.length)), '{}');
    await expect(auditPublication({ publicDirectory: dir, expectedDate: '2026-09-16' })).rejects.toThrow('asset-integrity-failed');
  });
  it('reads budget without mutating it and preserves unknown reservations across month boundaries', () => {
    const { dir } = fixture(); const path = join(dir, 'ledger.sqlite'); const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE budget_requests(day TEXT,month TEXT,state TEXT,settled_nano INTEGER,reserved_nano INTEGER,started_at INTEGER,input_hit INTEGER,input_miss INTEGER,output_tokens INTEGER);
      CREATE TABLE budget_project(pause_reason TEXT,daily_nano INTEGER,monthly_nano INTEGER);
      INSERT INTO budget_project VALUES (NULL,5000000000,50000000000);
      INSERT INTO budget_requests VALUES ('2026-08-31','2026-08','unknown',NULL,200000000,0,NULL,NULL,NULL);
      INSERT INTO budget_requests VALUES ('2026-09-16','2026-09','settled',100000000,0,0,0,100,20);`); db.close();
    const before = readFileSync(path);
    const report = readBudgetHealth(path, Date.parse('2026-09-16T00:00:00Z'), { dailyLimitCny: 5, monthlyLimitCny: 50, priceValidUntil: '2026-09-15T00:00:00Z' });
    expect(report.dailyCostCny).toBe(0.1); expect(report.reservedCny).toBe(0.2);
    expect(report.issues.map(x => x.code)).toEqual(expect.arrayContaining(['budget-unsettled', 'model-price-expired']));
    expect(readFileSync(path)).toEqual(before);
  });
});
