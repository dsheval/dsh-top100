import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import { beginSourceRecovery, completeSourceRecovery, loadSourceRecovery, sourceRecoveryDue, type SourceRecoveryState } from '../src/source-recovery.js';
import { atomicOperationJson } from '../src/operation-state.js';
const now = Date.parse('2026-09-16T00:00:00Z'), day = 86_400_000;
const source = { fullName: 'test/plugin', type: 'cordis-plugin', pushedAt: '2026-09-15', install: { packageName: '@test/plugin' } } as DshPlugin;
describe('durable source recovery', () => {
  it('persists backoff across restart, admits changed sources and clears recovery only after validation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'source-recovery-')), path = join(dir, 'state.json');
    try {
      const state = loadSourceRecovery(path);
      beginSourceRecovery(source, state, now); atomicOperationJson(path, state);
      const restored = loadSourceRecovery(path);
      expect(sourceRecoveryDue(source, restored, now + 1)).toBe(false);
      expect(sourceRecoveryDue(source, restored, now + day)).toBe(true);
      expect(sourceRecoveryDue({ ...source, pushedAt: '2026-09-16' }, restored, now + 1)).toBe(true);
      beginSourceRecovery(source, restored, now + day);
      completeSourceRecovery(source, restored, { status: 'verified', content: 'missing-source' });
      expect(restored.entries['test/plugin'].status).toBe('missing-source');
      expect(Date.parse(restored.entries['test/plugin'].nextCheckAt)).toBe(now + 3 * day);
      completeSourceRecovery(source, restored, { status: 'verified', content: 'ready' });
      expect(restored.entries).toEqual({});
      writeFileSync(path, '{invalid'); expect(() => loadSourceRecovery(path)).toThrow();
      writeFileSync(path, 'null'); expect(() => loadSourceRecovery(path)).toThrow('invalid-source-recovery-state');
      writeFileSync(path, JSON.stringify({ schemaVersion: 1, entries: { 'test/plugin': {} } }));
      expect(() => loadSourceRecovery(path)).toThrow('invalid-source-recovery-state');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps free retry backoff bounded without touching paid job state', () => {
    const state: SourceRecoveryState = { schemaVersion: 1, entries: {} };
    for (let i = 0; i < 10; i++) beginSourceRecovery(source, state, now);
    expect(Date.parse(state.entries['test/plugin'].nextCheckAt)).toBe(now + 7 * day);
    expect(Object.keys(state)).toEqual(['schemaVersion', 'entries']);
  });
});
