/** Read-only verification of the publication and the persistent monetary ledger. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RankingManifestV2, RankingFileReference } from '@dsh-top100/schema';
import type { RankingEntry } from './rankings.js';
import { hasPublishedChinese } from './board-descriptions.js';
import { localDay } from './operation-state.js';

export interface OperationIssue {
  key: string;
  severity: 'info' | 'warning' | 'critical';
  code: string;
  subject?: string;
  /** A successful daily observation, not a watchdog tick. */
  observationId?: string;
  /** Currently visible as a missing description on a published Top100 board. */
  affectsBoard?: boolean;
}
export interface PublicationAudit {
  schemaVersion: 1;
  checkedAt: string;
  snapshotId: string;
  snapshotDate: string;
  localAssetsVerified: number;
  publicVerified: boolean;
  pluginCount: number;
  skillCount: number;
  boards: Record<'hot' | 'rising', { total: number; covered: number; missing: { fullName: string; state: string }[] }>;
  issues: OperationIssue[];
}
function references(value: unknown, result: RankingFileReference[] = []): RankingFileReference[] {
  if (Array.isArray(value)) for (const child of value) references(child, result);
  else if (value && typeof value === 'object') {
    if ('url' in value && 'sha256' in value) result.push(value as RankingFileReference);
    for (const child of Object.values(value)) references(child, result);
  }
  return result;
}
function checkedJson(bytes: Buffer, ref: RankingFileReference, snapshotId: string): any {
  if (bytes.length !== ref.bytes || createHash('sha256').update(bytes).digest('hex') !== ref.sha256) throw new Error('asset-integrity-failed');
  const data = JSON.parse(bytes.toString('utf8'));
  if (data.snapshotId !== snapshotId || !Array.isArray(data.rankings) || data.rankings.length !== ref.count) throw new Error('asset-shape-failed');
  return data;
}
export async function auditPublication(options: {
  publicDirectory: string; expectedDate: string; publicOrigin?: string;
  now?: number; transport?: typeof fetch;
}): Promise<PublicationAudit> {
  const now = options.now ?? Date.now();
  const manifest = JSON.parse(readFileSync(join(options.publicDirectory, 'manifest.json'), 'utf8')) as RankingManifestV2;
  if (manifest.schemaVersion !== 2 || manifest.snapshotDate !== options.expectedDate
    || !manifest.snapshotId.startsWith(`${options.expectedDate}-`) || !Number.isFinite(Date.parse(manifest.generatedAt))) throw new Error('snapshot-date-mismatch');
  const prefix = `/data/snapshots/${manifest.snapshotId}/`;
  const refs = references(manifest);
  if (!refs.length) throw new Error('empty-manifest');
  const boards = {} as PublicationAudit['boards'];
  const boardRows = {} as Record<'hot' | 'rising', RankingEntry[]>;
  for (const ref of refs) {
    if (!ref.url.startsWith(prefix) || ref.url.includes('..') || /[%?#\\]/.test(ref.url)) throw new Error('invalid-snapshot-reference');
    const path = resolve(options.publicDirectory, ref.url.slice('/data/'.length));
    if (!path.startsWith(resolve(options.publicDirectory) + sep)) throw new Error('invalid-snapshot-path');
    const data = checkedJson(readFileSync(path), ref, manifest.snapshotId);
    for (const board of ['hot', 'rising'] as const) if (ref.url === manifest.datasets[board].url) boardRows[board] = data.rankings;
  }
  const issues: OperationIssue[] = [];
  for (const board of ['hot', 'rising'] as const) {
    const rows = boardRows[board];
    if (!rows || rows.length !== Math.min(100, manifest.datasets.total.count)
      || new Set(rows.map(row => row.fullName.toLowerCase())).size !== rows.length
      || rows.some((row, index) => row.rank !== index + 1)) throw new Error('board-membership-invalid');
    if (rows.some(row => row.install?.discovery?.evidence.some(value => value.startsWith('selected-package-ineligible:')))) throw new Error('quarantined-package-published');
    const missing = rows.filter(row => !hasPublishedChinese(row)).map(row => ({ fullName: row.fullName, state: row.descriptionStatus?.state ?? 'pending' }));
    boards[board] = { total: rows.length, covered: rows.length - missing.length, missing };
    if (missing.length > 5) issues.push({ key: `coverage:${board}`, severity: 'warning', code: 'board-description-gaps', subject: board });
    for (const entry of missing) {
      const row = rows.find(row => row.fullName === entry.fullName)!;
      const protectedChange = row.install?.discovery?.evidence.some(value => value.startsWith('Reviewed source files changed or disappeared:'));
      issues.push({ key: `description:${entry.fullName.toLowerCase()}`, severity: 'info', observationId: manifest.snapshotDate, affectsBoard: true,
        code: protectedChange ? 'reviewed-function-source-changed' : `description-${entry.state}`, subject: entry.fullName });
    }
  }
  let publicVerified = false;
  if (options.publicOrigin) {
    const origin = new URL(options.publicOrigin);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
      || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname))) throw new Error('invalid-public-origin');
    const get = async (url: string) => {
      const response = await (options.transport ?? fetch)(url, { signal: AbortSignal.timeout(30_000), redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new Error('public-fetch-failed');
      return Buffer.from(await response.arrayBuffer());
    };
    const remote = JSON.parse((await get(new URL('/data/manifest.json', origin).href)).toString('utf8')) as RankingManifestV2;
    if (remote.snapshotId !== manifest.snapshotId || JSON.stringify(remote) !== JSON.stringify(manifest)) throw new Error('public-manifest-mismatch');
    await Promise.all((['hot', 'rising'] as const).map(async board => {
      const ref = manifest.datasets[board]; checkedJson(await get(new URL(ref.url, origin).href), ref, manifest.snapshotId);
    }));
    publicVerified = true;
  }
  return { schemaVersion: 1, checkedAt: new Date(now).toISOString(), snapshotId: manifest.snapshotId,
    snapshotDate: manifest.snapshotDate, localAssetsVerified: refs.length, publicVerified,
    pluginCount: manifest.datasets.total.count, skillCount: manifest.datasets.skills.count,
    boards, issues: [...new Map(issues.map(issue => [issue.key, issue])).values()] };
}

export function readBudgetHealth(path: string, now: number, policy: {
  dailyLimitCny: number; monthlyLimitCny: number; priceValidUntil: string;
}) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const date = localDay(now).date;
    db.exec('PRAGMA busy_timeout=5000');
    const rows = db.prepare(`SELECT day,month,state,settled_nano,reserved_nano,started_at,input_hit,input_miss,output_tokens FROM budget_requests`).all() as unknown as {
      day: string; month: string; state: string; settled_nano: number | null; reserved_nano: number;
      started_at: number; input_hit: number | null; input_miss: number | null; output_tokens: number | null;
    }[];
    const project = db.prepare('SELECT pause_reason,daily_nano,monthly_nano FROM budget_project').get() as { pause_reason: string | null; daily_nano: number; monthly_nano: number } | undefined;
    if (!project || project.daily_nano / 1e9 !== policy.dailyLimitCny || project.monthly_nano / 1e9 !== policy.monthlyLimitCny) throw new Error('budget-policy-mismatch');
    const sum = (selected: typeof rows, reserved = false) => selected.reduce((n, row) => n + (reserved
      ? row.state === 'settled' ? 0 : row.reserved_nano : row.state === 'settled' ? row.settled_nano ?? 0 : 0), 0) / 1e9;
    const daily = rows.filter(row => row.day === date), monthly = rows.filter(row => row.month === date.slice(0, 7));
    const issues: OperationIssue[] = [];
    if (project?.pause_reason) issues.push({ key: 'budget-paused', severity: 'critical', code: 'budget-paused' });
    if (rows.some(row => row.state === 'unknown' || row.state !== 'settled' && now - row.started_at > 90_000)) issues.push({ key: 'budget-unsettled', severity: 'warning', code: 'budget-unsettled' });
    // The production ledger carries ALL unresolved reservations across day/month boundaries.
    if (sum(daily) + sum(rows, true) >= policy.dailyLimitCny || sum(monthly) + sum(rows, true) >= policy.monthlyLimitCny) issues.push({ key: 'budget-exhausted', severity: 'warning', code: 'budget-exhausted' });
    const remaining = Date.parse(policy.priceValidUntil) - now;
    if (!Number.isFinite(remaining) || remaining <= 0) issues.push({ key: 'model-price', severity: 'critical', code: 'model-price-expired' });
    else if (remaining <= 48 * 3_600_000) issues.push({ key: 'model-price', severity: 'warning', code: 'model-price-expiring' });
    return { model: 'deepseek-flash', thinking: 'disabled', dailyRequests: daily.length, dailyCostCny: sum(daily), monthlyCostCny: sum(monthly), reservedCny: sum(rows, true),
      actualTokens: { inputHit: daily.reduce((n, r) => n + (r.input_hit ?? 0), 0), inputMiss: daily.reduce((n, r) => n + (r.input_miss ?? 0), 0), output: daily.reduce((n, r) => n + (r.output_tokens ?? 0), 0) },
      priceValidUntil: policy.priceValidUntil, issues };
  } finally { db.close(); }
}
