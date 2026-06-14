import { db } from '../db/index.js';

export function createScrapeRun(companyId: number): number {
  const info = db.prepare('INSERT INTO scrape_runs (company_id) VALUES (?)').run(companyId);
  return Number(info.lastInsertRowid);
}

export function finishScrapeRun(
  runId: number,
  result: {
    status: 'success' | 'failed';
    method: string;
    pagesCrawled: number;
    listingsFound: number;
    listingsNew: number;
    error?: string | null;
  }
): void {
  db.prepare(
    `UPDATE scrape_runs
     SET status = ?, method = ?, pages_crawled = ?, listings_found = ?, listings_new = ?,
         error = ?, finished_at = datetime('now')
     WHERE id = ?`
  ).run(
    result.status,
    result.method,
    result.pagesCrawled,
    result.listingsFound,
    result.listingsNew,
    result.error ?? null,
    runId
  );
}

/**
 * Called on boot: anything still marked "running" was killed by a restart
 * mid-scrape, so settle it as failed instead of leaving the UI spinning forever.
 */
export function recoverInterruptedScrapes(): void {
  db.prepare(
    `UPDATE scrape_runs
     SET status = 'failed', error = 'Interrupted by server restart', finished_at = datetime('now')
     WHERE status = 'running'`
  ).run();
  db.prepare(
    `UPDATE companies
     SET last_scrape_status = 'failed', last_scrape_error = 'Scrape interrupted by server restart — scrape again'
     WHERE last_scrape_status = 'running'`
  ).run();
}

export function listScrapeRuns(companyId: number, limit = 10) {
  return db
    .prepare(
      `SELECT id, status, method, pages_crawled AS pagesCrawled,
              listings_found AS listingsFound, listings_new AS listingsNew,
              error, started_at AS startedAt, finished_at AS finishedAt
       FROM scrape_runs WHERE company_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(companyId, limit);
}
