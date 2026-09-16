/** Free source recovery only. This state never resets model jobs or reservations. */
import { createHash } from 'node:crypto';
import type { DshPlugin } from '@dsh-top100/schema';
import { nextContentAttemptAt } from './content-source.js';
import { readOperationJson } from './operation-state.js';

export interface SourceRecoveryEntry {
  fullName: string; identity: string; revisionHint: string;
  attempts: number; firstSeenAt: string; checkedAt: string; nextCheckAt: string;
  status: 'checking' | 'missing-source' | 'review-required';
}
export interface SourceRecoveryState { schemaVersion: 1; entries: Record<string, SourceRecoveryEntry>; }
const identity = (source: DshPlugin) => createHash('sha256').update(JSON.stringify([
  source.fullName.toLowerCase(), source.type, source.install.packageName, source.install.repositoryPath ?? '',
])).digest('hex');
export const recoveryKey = (source: DshPlugin) => source.fullName.toLowerCase();
export function loadSourceRecovery(path: string): SourceRecoveryState {
  const stored = readOperationJson<SourceRecoveryState>(path);
  const state = stored === undefined ? { schemaVersion: 1 as const, entries: {} } : stored;
  if (!state || state.schemaVersion !== 1 || !state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)
    || Object.entries(state.entries).some(([key, entry]) => !entry || key !== entry.fullName?.toLowerCase()
      || !/^[a-f0-9]{64}$/.test(entry.identity) || typeof entry.revisionHint !== 'string'
      || !Number.isInteger(entry.attempts) || entry.attempts < 1
      || !['checking', 'missing-source', 'review-required'].includes(entry.status)
      || [entry.firstSeenAt, entry.checkedAt, entry.nextCheckAt].some(at => !Number.isFinite(Date.parse(at))))) {
    throw new Error('invalid-source-recovery-state');
  }
  return state;
}
export function sourceRecoveryDue(source: DshPlugin, state: SourceRecoveryState, now: number): boolean {
  const old = state.entries[recoveryKey(source)];
  return !old || old.identity !== identity(source) || old.revisionHint !== (source.pushedAt ?? '')
    || Date.parse(old.nextCheckAt) <= now;
}
export function beginSourceRecovery(source: DshPlugin, state: SourceRecoveryState, now: number) {
  const key = recoveryKey(source), old = state.entries[key];
  const same = old?.identity === identity(source) && old.revisionHint === (source.pushedAt ?? '');
  const attempts = same ? old.attempts + 1 : 1;
  state.entries[key] = { fullName: source.fullName, identity: identity(source), revisionHint: source.pushedAt ?? '', attempts,
    firstSeenAt: old?.firstSeenAt ?? new Date(now).toISOString(), checkedAt: new Date(now).toISOString(),
    nextCheckAt: nextContentAttemptAt(attempts, now), status: 'checking' };
}
export function completeSourceRecovery(source: DshPlugin, state: SourceRecoveryState,
  result: { status: string; content?: string }) {
  const key = recoveryKey(source);
  if (result.status === 'excluded' || result.status === 'verified' && result.content !== 'missing-source' && result.content !== 'review-required') {
    delete state.entries[key];
  } else if (state.entries[key]) state.entries[key].status = result.content === 'missing-source' ? 'missing-source' : 'review-required';
}
export function recoveryCandidate(source: DshPlugin, state: SourceRecoveryState): boolean {
  return !!state.entries[recoveryKey(source)] || !!source.install.discovery?.evidence.some(value => value.startsWith('selected-package-ineligible:'));
}
