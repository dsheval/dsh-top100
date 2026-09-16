import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
if (process.env.DSH_AUTOMATION_ENABLED !== '1') process.exit(0);
const name = process.argv[2];
if (!['scheduler', 'watchdog'].includes(name)) process.exit(1);
try {
  const { at } = JSON.parse(readFileSync(join(dirname(process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'), 'operations', `${name}-heartbeat.json`), 'utf8'));
  const age = Date.now() - Date.parse(at);
  process.exit(Number.isFinite(age) && age >= 0 && age < (name === 'scheduler' ? 3 : 10) * 60_000 ? 0 : 1);
} catch { process.exit(1); }
