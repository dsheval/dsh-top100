/** Entrypoint launched only under scripts/operation-lock.sh. */
import './env.js';
import { spawn } from 'node:child_process';
import { fstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceOperation, atomicOperationJson, dailyOperationDue, loadOperation, localDay, operationPath, type Stage } from './operation-state.js';
import { auditPublication } from './operation-audit.js';
import { assessDiskSpace } from './disk-space.js';
import { observeDisk } from './disk-observation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = dirname(resolve(root, process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'));
const operations = join(runtime, 'operations');
const publicDirectory = resolve(root, process.env.PUBLIC_DATA_DIR ?? 'runtime/public-data');
const timeZone = process.env.TZ ?? 'Asia/Shanghai';
const hour = Number(process.env.COLLECT_HOUR ?? '6');
const fullWeekday = Number(process.env.FULL_DISCOVERY_WEEKDAY ?? '0');
if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(fullWeekday) || fullWeekday < 0 || fullWeekday > 6) throw new Error('invalid-schedule');
if (process.env.DSH_OPERATION_LOCK_FD !== '9') throw new Error('scheduler-requires-os-lock');
fstatSync(9);
let running = false, stopping = false;
let child: ReturnType<typeof spawn> | undefined;
function stopGroup(signal: NodeJS.Signals) {
  if (child?.pid) try { process.kill(-child.pid, signal); } catch { /* already stopped */ }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopping = true; stopGroup('SIGTERM');
  setTimeout(() => { stopGroup('SIGKILL'); process.exit(1); }, 10_000).unref();
  if (!running) process.exit(0);
});
function command(stage: Exclude<Stage, 'verify'>, date: string): Promise<void> {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return new Promise((ok, fail) => {
    const disk = observeDisk(runtime), runId = Date.now();
    const finishDisk = () => {
      const report = disk.finish();
      try { atomicOperationJson(join(operations, 'disk-usage', `${date}-${stage}-${runId}.json`), { ...report, stage, date }); }
      catch { console.error('[scheduler] disk-observation-write-failed'); }
    };
    const processChild = spawn('npm', ['run', stage === 'collect' ? 'collect' : 'db:sync'], {
      cwd: root, detached: true,
      // Retain the shared flock in the phase tree even if the scheduler is killed.
      stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9],
      env: { ...process.env, DSH_DAILY_UPDATE: '1', DSH_OPERATION_DATE: date,
        DSH_DISCOVERY_MODE: weekday === fullWeekday ? 'full' : 'incremental' },
    });
    child = processChild;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true; stopGroup('SIGTERM');
      killTimer = setTimeout(() => { if (processChild.pid) try { process.kill(-processChild.pid, 'SIGKILL'); } catch { /* exited */ } }, 10_000);
      killTimer.unref();
    }, 90 * 60_000);
    processChild.once('error', () => { clearTimeout(timeout); finishDisk(); child = undefined; fail(new Error('phase-start-failed')); });
    processChild.once('exit', code => { clearTimeout(timeout); if (killTimer) clearTimeout(killTimer); finishDisk(); child = undefined; code === 0 && !timedOut ? ok() : fail(new Error('phase-failed')); });
  });
}
async function tick() {
  if (running || stopping) return;
  const now = Date.now(), today = localDay(now, timeZone);
  if (!dailyOperationDue(now, hour, timeZone, process.env.DSH_AUTOMATION_START_DATE)) return;
  running = true;
  try {
    const state = loadOperation(operations, today.date, now);
    await advanceOperation(state, { now: Date.now, timeZone,
      persist: state => atomicOperationJson(operationPath(operations, state.date), state),
      beforeStage: stage => {
        if (stage === 'verify') return true;
        try {
          const report = assessDiskSpace({ databasePath: resolve(root, process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'),
            sourcePath: resolve(root, process.env.SOURCE_DATA_PATH ?? 'data/plugins.json'), publicDirectory });
          atomicOperationJson(join(operations, 'disk-preflight.json'), { ...report, stage, date: today.date });
          return report.status === 'ready';
        } catch {
          atomicOperationJson(join(operations, 'disk-preflight.json'), { schemaVersion: 1, checkedAt: new Date().toISOString(),
            status: 'unknown', code: 'disk-check-failed', stage, date: today.date });
          return false;
        }
      },
      execute: async stage => {
        if (stopping) throw new Error('scheduler-stopping');
        if (stage !== 'verify') {
          await command(stage, today.date);
          return;
        }
        // Missing public configuration is visible, never reported as a successful public check.
        if (!process.env.DSH_PUBLIC_ORIGIN) throw new Error('public-origin-unconfigured');
        const audit = await auditPublication({ publicDirectory, expectedDate: today.date, publicOrigin: process.env.DSH_PUBLIC_ORIGIN });
        atomicOperationJson(join(operations, 'publication-audit.json'), audit);
        return { snapshotId: audit.snapshotId };
      },
    });
  } catch { atomicOperationJson(join(operations, 'scheduler-error.json'), { code: 'scheduler-state-failed', at: new Date().toISOString() }); }
  finally { running = false; if (stopping) process.exit(0); }
}
const heartbeat = () => atomicOperationJson(join(operations, 'scheduler-heartbeat.json'), { at: new Date().toISOString() });
heartbeat(); setInterval(heartbeat, 30_000);
// Deployment/startup never dispatches paid work. The first scheduled tick is one minute later.
setInterval(() => void tick(), 60_000);
console.log('[scheduler] persistent daily recovery enabled; first check in 60 seconds');
