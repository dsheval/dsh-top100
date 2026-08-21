/**
 * 轻量并发池：限制同时运行的异步任务数
 */

export async function runPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 10
): Promise<void> {
  let next = 0;
  const n = items.length;
  const errors: Error[] = [];

  async function runWorker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= n) break;
      try {
        await worker(items[idx], idx);
      } catch (err) {
        errors.push(err as Error);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, n) }, () => runWorker());
  await Promise.all(workers);
  if (errors.length > 0) {
    console.warn(`  [pool] ${errors.length} tasks failed (first: ${errors[0].message.slice(0, 80)})`);
  }
}
