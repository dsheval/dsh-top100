import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advanceOperation, atomicOperationJson, dailyOperationDue, hasExhaustedStage, loadOperation, localDay, nextStage, operationPath, type Stage } from '../src/operation-state.js';
import { reconcileIncidents } from '../src/operation-incidents.js';
const dirs: string[] = [];
const now = Date.parse('2026-09-16T00:00:00Z');
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'operation-')); dirs.push(dir); return { dir, state: loadOperation(dir, '2026-09-16', now) }; }
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
describe('durable daily operation', () => {
  it('allows all six verification attempts before reporting exhaustion, while collection remains capped at three', () => {
    const { state } = fixture();
    state.stages.collect = { status: 'complete', attempts: 1 };
    state.stages.publish = { status: 'complete', attempts: 1 };
    for (const attempts of [3, 4, 5]) {
      state.stages.verify = { status: 'failed', attempts };
      expect(hasExhaustedStage(state)).toBe(false); expect(nextStage(state, now)).toBe('verify');
    }
    state.stages.verify.attempts = 6;
    expect(hasExhaustedStage(state)).toBe(true); expect(nextStage(state, now)).toBeUndefined();
    const collection = fixture().state; collection.stages.collect = { status: 'failed', attempts: 3 };
    expect(hasExhaustedStage(collection)).toBe(true); expect(nextStage(collection, now)).toBeUndefined();
  });
  it('waits for activation day and collection hour, then permits catch-up all day', () => {
    expect(dailyOperationDue(now, 6, 'Asia/Shanghai', '2026-09-17')).toBe(false);
    expect(dailyOperationDue(Date.parse('2026-09-15T21:59:00Z'), 6)).toBe(false);
    expect(dailyOperationDue(now, 6)).toBe(true);
  });
  it('catches up after the old five-minute window and resumes verification without rerunning paid stages', async () => {
    const { dir, state } = fixture(); const calls: Stage[] = []; let at = now;
    const persist = (value: typeof state) => atomicOperationJson(operationPath(dir, state.date), value);
    await advanceOperation(state, { now: () => at, timeZone: 'Asia/Shanghai', persist,
      execute: async stage => { calls.push(stage); if (stage === 'verify') throw new Error('private provider response'); } });
    expect(calls).toEqual(['collect', 'publish', 'verify']);
    const restored = loadOperation(dir, state.date, now);
    expect(JSON.stringify(restored)).not.toContain('private provider');
    expect(nextStage(restored, at)).toBeUndefined();
    at += 5 * 60_000;
    await advanceOperation(restored, { now: () => at, timeZone: 'Asia/Shanghai', persist,
      execute: async stage => { calls.push(stage); return { snapshotId: 'verified-snapshot' }; } });
    expect(calls).toEqual(['collect', 'publish', 'verify', 'verify']);
    expect(restored.stages.verify.status).toBe('complete');
    expect(nextStage(restored, at + 100_000)).toBeUndefined();
  });
  it('recovers an interrupted phase but caps repeated failures and preserves earlier completed work', async () => {
    const { state } = fixture(); state.stages.collect = { status: 'complete', attempts: 1 };
    state.stages.publish = { status: 'running', attempts: 1 };
    const execute = vi.fn(async () => { throw new Error('failure'); });
    for (const at of [now, now + 60 * 60_000, now + 2 * 60 * 60_000]) {
      await advanceOperation(state, { now: () => at, timeZone: 'Asia/Shanghai', persist: () => {}, execute });
    }
    expect(execute).toHaveBeenCalledTimes(2); expect(state.stages.publish.attempts).toBe(3);
    expect(state.stages.collect.attempts).toBe(1); expect(state.stages.verify.attempts).toBe(0);
  });
  it('does not publish an old collection across the Beijing date boundary', async () => {
    const { state } = fixture(); let at = Date.parse('2026-09-16T15:59:59Z');
    const execute = vi.fn(async () => { at += 2000; });
    await advanceOperation(state, { now: () => at, timeZone: 'Asia/Shanghai', persist: () => {}, execute });
    expect(execute).toHaveBeenCalledTimes(1); expect(state.stages.publish.status).toBe('pending');
    expect(localDay(at).date).toBe('2026-09-17');
  });
  it('fails closed on corrupt state instead of clearing completion history', () => {
    const { dir, state } = fixture(); const path = operationPath(dir, state.date);
    atomicOperationJson(path, state); writeFileSync(path, '{invalid');
    expect(() => loadOperation(dir, state.date, now)).toThrow();
  });
});
describe('GEO event outbox', () => {
  const issue = { key: 'source:a/b', severity: 'warning' as const, code: 'source-changed', subject: 'a/b' };
  it('emits one opening, no daily duplicates, a material change and one recovery', () => {
    const first = reconcileIncidents(undefined, [issue], now);
    expect(first.events).toHaveLength(1); expect(first.events[0].actionable).toBe(true);
    const repeat = reconcileIncidents(first.state, [issue], now + 86_400_000); expect(repeat.events).toEqual([]);
    const changed = reconcileIncidents(repeat.state, [{ ...issue, code: 'identity-invalid' }], now + 2 * 86_400_000);
    expect(changed.events[0].kind).toBe('changed');
    const resolved = reconcileIncidents(changed.state, [], now + 3 * 86_400_000);
    expect(resolved.events[0].kind).toBe('resolved');
    expect(reconcileIncidents(resolved.state, [], now + 4 * 86_400_000).events).toEqual([]);
  });
  it('uses retry-stable event IDs if interrupted before state acknowledgement', () => {
    expect(reconcileIncidents(undefined, [issue], now).events[0].id)
      .toBe(reconcileIncidents(undefined, [issue], now + 300_000).events[0].id);
  });
  it('records ordinary missing-source items without marking them for notification', () => {
    expect(reconcileIncidents(undefined, [{ ...issue, severity: 'info' }], now).events[0].actionable).toBe(false);
  });
  it('escalates only after three distinct daily observations, deduplicates warnings and automatically closes recovery', () => {
    const content = { key: 'description:a/b', code: 'reviewed-function-source-changed', subject: 'a/b', severity: 'info' as const, observationId: '2026-09-16' };
    const first = reconcileIncidents(undefined, [content], now);
    expect(first.events[0].actionable).toBe(false);
    const polls = reconcileIncidents(first.state, [content], now + 3 * 86_400_000);
    expect(polls.events).toEqual([]); expect(polls.state.incidents[content.key].observedDays).toHaveLength(1);
    const second = reconcileIncidents(polls.state, [{ ...content, observationId: '2026-09-17' }], now + 4 * 86_400_000);
    expect(second.events).toEqual([]);
    const third = reconcileIncidents(second.state, [{ ...content, observationId: '2026-09-18' }], now + 5 * 86_400_000);
    expect(third.events).toHaveLength(1); expect(third.events[0]).toMatchObject({ kind: 'changed', actionable: true, incident: { severity: 'warning' } });
    const repeat = reconcileIncidents(third.state, [{ ...content, observationId: '2026-09-19' }], now + 6 * 86_400_000);
    expect(repeat.events).toEqual([]);
    const recovered = reconcileIncidents(repeat.state, [], now + 7 * 86_400_000);
    expect(recovered.events[0]).toMatchObject({ kind: 'resolved', actionable: true });
    const reopened = reconcileIncidents(recovered.state, [{ ...content, observationId: '2026-09-20' }], now + 8 * 86_400_000);
    expect(reopened.events[0].actionable).toBe(false); expect(reopened.state.incidents[content.key].observedDays).toEqual(['2026-09-20']);
  });
  const boardGap = { key: 'description:fixture/slow-recovery', severity: 'info' as const,
    code: 'description-missing-source', observationId: '2026-09-16', affectsBoard: true };
  const hours = (value: number) => now + value * 3_600_000;
  it('escalates persistent board impact at 48 hours even with one snapshot, then emits only one recovery', () => {
    const first = reconcileIncidents(undefined, [boardGap], now);
    const before = reconcileIncidents(first.state, [boardGap], hours(48) - 1);
    expect(before.events).toEqual([]);
    // Roundtrip represents a watchdog restart with persisted state.
    const restored = JSON.parse(JSON.stringify(before.state));
    const due = reconcileIncidents(restored, [boardGap], hours(48));
    expect(due.events).toHaveLength(1);
    expect(due.events[0]).toMatchObject({ kind: 'changed', actionable: true, incident: { severity: 'warning' } });
    expect(due.state.incidents[boardGap.key].observedDays).toEqual(['2026-09-16']);
    expect(reconcileIncidents(restored, [boardGap], hours(49)).events[0].id).toBe(due.events[0].id);
    expect(reconcileIncidents(due.state, [boardGap], hours(72)).events).toEqual([]);
    const recovered = reconcileIncidents(due.state, [], hours(73));
    expect(recovered.events[0].kind).toBe('resolved');
    expect(reconcileIncidents(recovered.state, [], hours(74)).events).toEqual([]);
    const recurrence = reconcileIncidents(recovered.state, [boardGap], hours(100));
    expect(recurrence.events[0].actionable).toBe(false);
    expect(recurrence.state.incidents[boardGap.key].boardImpactSince).toBe(new Date(hours(100)).toISOString());
  });
  it('does not apply the 48-hour rule to off-board quarantines and starts timing only when board impact begins', () => {
    const offBoard = { ...boardGap, affectsBoard: false };
    const first = reconcileIncidents(undefined, [offBoard], now);
    const later = reconcileIncidents(first.state, [offBoard], hours(200));
    expect(later.events).toEqual([]);
    const entered = reconcileIncidents(later.state, [boardGap], hours(201));
    expect(entered.events).toEqual([]);
    expect(reconcileIncidents(entered.state, [boardGap], hours(248)).events).toEqual([]);
    const exited = reconcileIncidents(entered.state, [offBoard], hours(220));
    expect(exited.state.incidents[boardGap.key].boardImpactSince).toBeUndefined();
    const reentered = reconcileIncidents(exited.state, [boardGap], hours(300));
    expect(reentered.state.incidents[boardGap.key].boardImpactSince).toBe(new Date(hours(300)).toISOString());
  });
  it('preserves but does not escalate an unavailable observation; a fresh check can confirm the outstanding impact', () => {
    const first = reconcileIncidents(undefined, [boardGap], now);
    const unavailable = reconcileIncidents(first.state, [first.state.incidents[boardGap.key]], hours(60),
      { unobservedKeys: new Set([boardGap.key]) });
    expect(unavailable.events).toEqual([]); expect(unavailable.state).toEqual(first.state);
    expect(reconcileIncidents(unavailable.state, [boardGap], hours(61)).events[0].incident.severity).toBe('warning');
  });
});
