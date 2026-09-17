/** Sample filesystem headroom during a phase; includes concurrent host writes. */
import { statfsSync } from 'node:fs';

export function observeDisk(path: string) {
  const startedAt = new Date().toISOString();
  let samples = 0, failedSamples = 0;
  let first: number | null = null, last: number | null = null, minimum: number | null = null;
  function sample() {
    try {
      const fs = statfsSync(path), available = fs.bavail * fs.bsize;
      if (!Number.isSafeInteger(available) || available < 0) throw new Error('invalid-capacity');
      first ??= available; last = available; minimum = Math.min(minimum ?? available, available); samples++;
    } catch { failedSamples++; }
  }
  sample();
  const timer = setInterval(sample, 1000); timer.unref();
  let result: ReturnType<typeof finish> | undefined;
  function finish(): {
    schemaVersion: number; startedAt: string; finishedAt: string; sampleIntervalMs: number;
    samples: number; failedSamples: number; startAvailableBytes: number | null; endAvailableBytes: number | null;
    minimumAvailableBytes: number | null; peakAdditionalBytes: number | null; netGrowthBytes: number | null;
  } {
    if (result) return result;
    clearInterval(timer); sample();
    result = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), sampleIntervalMs: 1000,
      samples, failedSamples, startAvailableBytes: first, endAvailableBytes: last, minimumAvailableBytes: minimum,
      peakAdditionalBytes: first !== null && minimum !== null ? first - minimum : null,
      netGrowthBytes: first !== null && last !== null ? first - last : null };
    return result;
  }
  return { finish };
}
