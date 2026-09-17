import { afterEach, expect, it, vi } from 'vitest';
import { statfsSync } from 'node:fs';
import { observeDisk } from '../src/disk-observation.js';
vi.mock('node:fs', () => ({ statfsSync: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
it('records temporary peak consumption even when the final footprint shrinks', () => {
  vi.useFakeTimers();
  vi.mocked(statfsSync).mockReturnValueOnce({ bavail: 1000, bsize: 1 } as any)
    .mockReturnValueOnce({ bavail: 500, bsize: 1 } as any)
    .mockReturnValueOnce({ bavail: 900, bsize: 1 } as any);
  const observation = observeDisk('/fixture'); vi.advanceTimersByTime(1000);
  const report = observation.finish();
  expect(report).toMatchObject({ samples: 3, failedSamples: 0, peakAdditionalBytes: 500, netGrowthBytes: 100 });
  expect(observation.finish()).toEqual(report);
  vi.advanceTimersByTime(5000); expect(statfsSync).toHaveBeenCalledTimes(3);
});
it('records unavailable samples explicitly instead of reporting zero consumption', () => {
  vi.useFakeTimers(); vi.mocked(statfsSync).mockImplementation(() => { throw new Error('unavailable'); });
  const report = observeDisk('/fixture').finish();
  expect(report).toMatchObject({ samples: 0, failedSamples: 2, peakAdditionalBytes: null, netGrowthBytes: null });
});
