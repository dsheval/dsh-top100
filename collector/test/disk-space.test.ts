import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, statfsSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessDiskSpace, estimateDisk } from '../src/disk-space.js';
import { advanceOperation, loadOperation } from '../src/operation-state.js';

const dirs: string[] = [], GiB = 1024 ** 3;
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, statfsSync: vi.fn(original.statfsSync) };
});
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'disk-space-')); dirs.push(dir);
  const sourcePath = join(dir, 'data/plugins.json'), publicDirectory = join(dir, 'public');
  mkdirSync(join(dir, 'data')); mkdirSync(publicDirectory);
  writeFileSync(sourcePath, '{}');
  const ref = { url: '/data/snapshots/2026-09-17-abc/total.json', bytes: 1024 };
  writeFileSync(join(publicDirectory, 'manifest.json'), JSON.stringify({ schemaVersion: 2, snapshotId: '2026-09-17-abc', datasets: { total: ref, alias: ref } }));
  return { dir, databasePath: join(dir, 'db.sqlite'), sourcePath, publicDirectory };
}
describe('disk capacity', () => {
  it('uses a 5 GiB minimum and increases for larger datasets', () => {
    const small = { databaseBytes: 1, sourceBytes: 1, sourceFilesBytes: 1, snapshotBytes: 1, exportBytes: 1 };
    expect(estimateDisk(small).requiredBytes).toBe(5 * GiB);
    expect(estimateDisk({ ...small, databaseBytes: 3 * GiB }).requiredBytes).toBeGreaterThan(8 * GiB);
    expect(() => estimateDisk({ ...small, sourceBytes: NaN })).toThrow();
  });
  it('counts manifest aliases once and ignores old snapshots without deleting them', () => {
    const options = fixture();
    mkdirSync(join(options.publicDirectory, 'snapshots'));
    writeFileSync(join(options.publicDirectory, 'snapshots', 'retained'), 'do not delete');
    const report = assessDiskSpace(options);
    expect(report.inputs.snapshotBytes).toBe(1024);
    expect(report.inputs.sourceBytes).toBe(2);
    expect(report.requiredBytes).toBe(5 * GiB);
    expect(report.availableBytes).toBeGreaterThanOrEqual(0);
  });
  it('fails closed on damaged manifests and symlinked inputs', () => {
    const options = fixture();
    writeFileSync(join(options.publicDirectory, 'manifest.json'), 'broken');
    expect(() => assessDiskSpace(options)).toThrow();
    rmSync(join(options.publicDirectory, 'manifest.json'));
    symlinkSync(options.sourcePath, join(options.dir, 'data', 'unexpected-link'));
    expect(() => assessDiskSpace(options)).toThrow();
  });
  it('checks available bytes rather than reserved free blocks, and refuses inode exhaustion', () => {
    const options = fixture(), fs = statfsSync(options.dir);
    const blocks = Math.ceil(5 * GiB / fs.bsize);
    vi.mocked(statfsSync).mockReturnValueOnce({ ...fs, bavail: blocks - 1, bfree: blocks * 2 });
    expect(assessDiskSpace(options).status).toBe('insufficient');
    vi.mocked(statfsSync).mockReturnValueOnce({ ...fs, bavail: blocks, files: 20_000, ffree: 10_000 });
    expect(assessDiskSpace(options).status).toBe('ready');
    vi.mocked(statfsSync).mockReturnValueOnce({ ...fs, bavail: blocks, files: 20_000, ffree: 9999 });
    expect(assessDiskSpace(options).status).toBe('insufficient');
  });
  it('can estimate a first collection without a source or manifest, but rejects an empty existing manifest', () => {
    const options = fixture();
    rmSync(options.sourcePath); rmSync(join(options.publicDirectory, 'manifest.json'));
    expect(assessDiskSpace(options).requiredBytes).toBe(5 * GiB);
    writeFileSync(join(options.publicDirectory, 'manifest.json'), '');
    expect(() => assessDiskSpace(options)).toThrow();
  });
  it('pauses before any paid stage without consuming attempts, then resumes only unfinished work', async () => {
    const { dir } = fixture(), now = Date.parse('2026-09-17T00:00:00Z');
    const state = loadOperation(dir, '2026-09-17', now);
    const execute = vi.fn(async () => {}), persist = vi.fn();
    await advanceOperation(state, { now: () => now, timeZone: 'Asia/Shanghai', persist, execute, beforeStage: () => false });
    expect(execute).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
    expect(state.stages.collect.attempts).toBe(0);
    await advanceOperation(state, { now: () => now, timeZone: 'Asia/Shanghai', persist, execute, beforeStage: stage => stage === 'collect' });
    expect(execute.mock.calls.map(call => call[0])).toEqual(['collect']);
    expect(state.stages.publish.attempts).toBe(0);
    await advanceOperation(state, { now: () => now, timeZone: 'Asia/Shanghai', persist, execute, beforeStage: () => true });
    expect(execute.mock.calls.map(call => call[0])).toEqual(['collect', 'publish', 'verify']);
  });
  it('does not dispatch after a capacity check crosses the date boundary', async () => {
    const { dir } = fixture(); let now = Date.parse('2026-09-17T15:59:59Z');
    const state = loadOperation(dir, '2026-09-17', now), execute = vi.fn(async () => {});
    await advanceOperation(state, { now: () => now, timeZone: 'Asia/Shanghai', persist: () => {}, execute,
      beforeStage: () => { now += 2000; return true; } });
    expect(execute).not.toHaveBeenCalled(); expect(state.stages.collect.attempts).toBe(0);
  });
});
