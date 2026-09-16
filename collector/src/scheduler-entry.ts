import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const watchdog = process.argv.includes('--watchdog');
if (watchdog) process.env.DSH_MONITOR_READ_ONLY = '1';
await import('./env.js');
if (process.env.DSH_AUTOMATION_ENABLED !== '1') {
  if (watchdog) throw new Error('automation-not-enabled');
  await import('./scheduler.js');
} else {
  const child = spawn('bash', [resolve(root, 'collector/scripts/operation-lock.sh'), watchdog ? 'watchdog' : 'scheduler'], { cwd: root, env: process.env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  child.on('error', () => { process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
