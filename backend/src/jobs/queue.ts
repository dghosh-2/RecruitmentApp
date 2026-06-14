import { logger } from '../utils/logger.js';

type Task = () => Promise<void>;

/**
 * Minimal in-process job queue with bounded concurrency.
 *
 * This is intentionally a seam: swap the internals for BullMQ/Redis (or add a
 * cron scheduler) later without changing any caller — callers only ever use
 * enqueue(name, task).
 */
export class JobQueue {
  private queue: { name: string; task: Task }[] = [];
  private active = 0;

  constructor(private readonly concurrency: number) {}

  enqueue(name: string, task: Task): void {
    this.queue.push({ name, task });
    this.drain();
  }

  get pending(): number {
    return this.queue.length + this.active;
  }

  private drain(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active += 1;
      job
        .task()
        .catch((err) => {
          logger.error('Background job failed', {
            job: job.name,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}
