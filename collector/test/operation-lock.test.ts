import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const dirs: string[] = [], pids: number[] = [];
afterEach(() => {
  for (const pid of pids.splice(0)) try { process.kill(pid, 'SIGKILL'); } catch { /* exited */ }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
it.skipIf(process.platform !== 'linux')('holds the OS lock through supervisor death until the phase exits, then allows recovery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'operation-lock-')); dirs.push(dir);
  mkdirSync(join(dir, 'collector/src'), { recursive: true });
  symlinkSync(resolve('../node_modules'), join(dir, 'node_modules'), 'dir');
  // Isolated phase fixture; it performs no collection, publication or network requests.
  writeFileSync(join(dir, 'collector/src/managed-scheduler.ts'), `
    import { spawn } from 'node:child_process';
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      stdio: ['ignore','ignore','ignore','ignore','ignore','ignore','ignore','ignore','ignore',9] });
    console.log(JSON.stringify({ parent: process.pid, child: child.pid }));
    setInterval(()=>{},1000);
  `);
  const start = () => spawn('bash', [resolve('scripts/operation-lock.sh'), 'scheduler'], {
    cwd: dir, env: { ...process.env, DATABASE_PATH: join(dir, 'runtime/data.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const owner = start();
  const ready = await new Promise<{ parent: number; child: number }>((ok, fail) => {
    const timeout = setTimeout(() => fail(new Error('lock-fixture-timeout')), 5000);
    owner.stdout.once('data', chunk => { clearTimeout(timeout); ok(JSON.parse(String(chunk))); });
    owner.once('error', fail);
  });
  pids.push(ready.parent, ready.child);
  const exited = new Promise(resolve => owner.once('exit', resolve)); process.kill(ready.parent, 'SIGKILL'); await exited;
  const blocked = start(); expect(await new Promise(resolve => blocked.once('exit', resolve))).toBe(75);
  process.kill(ready.child, 'SIGKILL');
  // Wait for the kernel to release the phase's inherited descriptor.
  await new Promise(resolve => setTimeout(resolve, 100));
  const recovered = start();
  const next = await new Promise<{ parent: number; child: number }>((ok, fail) => {
    const timeout = setTimeout(() => fail(new Error('lock-recovery-timeout')), 5000);
    recovered.stdout.once('data', chunk => { clearTimeout(timeout); ok(JSON.parse(String(chunk))); });
    recovered.once('error', fail);
  });
  pids.push(next.parent, next.child); expect(next.parent).not.toBe(ready.parent);
}, 15_000);
