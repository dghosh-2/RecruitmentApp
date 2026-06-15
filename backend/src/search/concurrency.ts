/**
 * Run async tasks with bounded concurrency, preserving input order in the
 * results. Unlike JobQueue (fire-and-forget, returns void), this collects each
 * task's return value, which the research fan-out needs.
 *
 * A rejected task does NOT abort the batch: it resolves to `{ ok: false }` so a
 * single failed agent never sinks the whole search.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: Error };

export async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number
): Promise<Settled<T>[]> {
  const results: Settled<T>[] = new Array(tasks.length);
  const effectiveLimit = Math.max(1, Math.min(limit, tasks.length || 1));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await tasks[index]() };
      } catch (err) {
        results[index] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
