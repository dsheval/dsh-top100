/** Read-only capacity estimate. No cache, snapshot or backup deletion here. */
import { lstatSync, readdirSync, readFileSync, statfsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const GiB = 1024 ** 3;
export interface DiskInputs {
  databaseBytes: number;
  sourceBytes: number;
  sourceFilesBytes: number;
  snapshotBytes: number;
  exportBytes: number;
}
export interface DiskReport {
  schemaVersion: 1;
  checkedAt: string;
  status: 'ready' | 'insufficient';
  availableBytes: number;
  requiredBytes: number;
  estimatedWorkingBytes: number;
  reserveBytes: number;
  availableInodes: number | null;
  requiredInodes: number;
  inputs: DiskInputs;
}

/** Conservative initial policy, to be calibrated with complete daily measurements.
 * Allow DB/WAL rewrites, source/job atomic replacements, snapshot staging and
 * compatibility exports, plus bounded cache growth and 1 GiB residual reserve.
 * This is an estimate, not a reservation or a bound on unrelated host writes.
 */
export function estimateDisk(inputs: DiskInputs): { estimatedWorkingBytes: number; requiredBytes: number } {
  if (Object.values(inputs).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('disk-input-invalid');
  const estimatedWorkingBytes = 2 * (inputs.databaseBytes + inputs.sourceFilesBytes + inputs.snapshotBytes + inputs.exportBytes)
    + Math.max(GiB, 4 * inputs.sourceBytes);
  const requiredBytes = Math.max(5 * GiB, estimatedWorkingBytes + GiB);
  if (!Number.isSafeInteger(requiredBytes)) throw new Error('disk-estimate-overflow');
  return { estimatedWorkingBytes, requiredBytes };
}

function fileBytes(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('disk-file-invalid');
  return stat.size;
}
function optionalFileBytes(path: string): number {
  try { return fileBytes(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
}
function flatFileBytes(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('disk-symlink-unsupported');
    if (entry.isFile()) total += fileBytes(join(directory, entry.name));
  }
  return total;
}
function publishedSize(publicDirectory: string): { bytes: number; files: number } {
  const manifestPath = join(publicDirectory, 'manifest.json');
  // No publication yet: the source/export allowances and 5 GiB floor still apply.
  try { fileBytes(manifestPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { bytes: 0, files: 0 }; throw error; }
  if (fileBytes(manifestPath) > 16 * 1024 ** 2) throw new Error('disk-manifest-too-large');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 2 || !/^\d{4}-\d{2}-\d{2}-[a-f0-9]+$/.test(manifest.snapshotId)) throw new Error('disk-manifest-invalid');
  const files = new Map<string, number>();
  const prefix = `/data/snapshots/${manifest.snapshotId}/`;
  function walk(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if ('url' in value && 'bytes' in value) {
      const ref = value as { url: string; bytes: number };
      if (typeof ref.url !== 'string' || !ref.url.startsWith(prefix) || /\.\.|[%?#\\]/.test(ref.url)
        || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) throw new Error('disk-reference-invalid');
      if (files.has(ref.url) && files.get(ref.url) !== ref.bytes) throw new Error('disk-reference-conflict');
      files.set(ref.url, ref.bytes);
    }
    for (const child of Object.values(value)) walk(child);
  }
  walk(manifest);
  if (!files.size) throw new Error('disk-manifest-empty');
  return { bytes: [...files.values()].reduce((a, b) => a + b, 0), files: files.size };
}

export function assessDiskSpace(options: {
  databasePath: string; sourcePath: string; publicDirectory: string; now?: number;
}): DiskReport {
  const runtime = dirname(options.databasePath), sourceDirectory = dirname(options.sourcePath);
  // Production uses one filesystem. Do not silently add capacities across mounts.
  const device = statSync(runtime).dev;
  if ([sourceDirectory, options.publicDirectory].some(path => statSync(path).dev !== device)) throw new Error('disk-multiple-filesystems-unsupported');
  for (const path of [options.databasePath, options.sourcePath]) {
    try { if (statSync(path).dev !== device) throw new Error('disk-multiple-filesystems-unsupported'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const snapshot = publishedSize(options.publicDirectory);
  const inputs: DiskInputs = {
    databaseBytes: optionalFileBytes(options.databasePath) + optionalFileBytes(`${options.databasePath}-wal`),
    sourceBytes: optionalFileBytes(options.sourcePath), sourceFilesBytes: flatFileBytes(sourceDirectory),
    snapshotBytes: snapshot.bytes, exportBytes: flatFileBytes(options.publicDirectory),
  };
  const estimate = estimateDisk(inputs);
  const fs = statfsSync(runtime);
  const availableBytes = fs.bavail * fs.bsize;
  const requiredInodes = Math.max(10_000, 2 * snapshot.files + 1000);
  const availableInodes = fs.files > 0 ? fs.ffree : null;
  if (!Number.isSafeInteger(availableBytes) || availableBytes < 0
    || availableInodes !== null && (!Number.isSafeInteger(availableInodes) || availableInodes < 0)) throw new Error('disk-capacity-invalid');
  return { schemaVersion: 1, checkedAt: new Date(options.now ?? Date.now()).toISOString(),
    status: availableBytes >= estimate.requiredBytes && (availableInodes === null || availableInodes >= requiredInodes) ? 'ready' : 'insufficient',
    availableBytes, ...estimate, reserveBytes: GiB, availableInodes, requiredInodes, inputs };
}
