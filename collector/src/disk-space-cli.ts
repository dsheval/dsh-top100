/** Read-only CLI for host maintenance. Does not load .env or model credentials. */
import { resolve } from 'node:path';
import { assessDiskSpace } from './disk-space.js';

try {
  const report = assessDiskSpace({
    databasePath: resolve(process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'),
    sourcePath: resolve(process.env.SOURCE_DATA_PATH ?? 'data/plugins.json'),
    publicDirectory: resolve(process.env.PUBLIC_DATA_DIR ?? 'runtime/public-data'),
  });
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'ready' ? 0 : 2;
} catch {
  console.log(JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), status: 'unknown', code: 'disk-check-failed' }));
  process.exitCode = 3;
}
