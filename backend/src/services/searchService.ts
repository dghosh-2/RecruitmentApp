import { db } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';
import type { SearchMode, SearchPlan, SearchResultCompany } from '../search/types.js';

export type SearchStatus = 'pending' | 'running' | 'success' | 'failed';

export interface CompanySearchRow {
  id: number;
  user_id: number;
  query: string;
  mode: SearchMode;
  status: SearchStatus;
  error: string | null;
  plan_json: string | null;
  results_json: string | null;
  created_at: string;
  finished_at: string | null;
}

/** Shape returned to the API (camelCase, with JSON columns parsed). */
export interface CompanySearchDto {
  id: number;
  query: string;
  mode: SearchMode;
  status: SearchStatus;
  error: string | null;
  plan: SearchPlan | null;
  results: SearchResultCompany[];
  createdAt: string;
  finishedAt: string | null;
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function toDto(row: CompanySearchRow): CompanySearchDto {
  return {
    id: row.id,
    query: row.query,
    mode: row.mode,
    status: row.status,
    error: row.error,
    plan: safeParse<SearchPlan | null>(row.plan_json, null),
    results: safeParse<SearchResultCompany[]>(row.results_json, []),
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export function createSearch(
  userId: number,
  query: string,
  mode: SearchMode = 'thorough'
): CompanySearchDto {
  const info = db
    .prepare('INSERT INTO company_searches (user_id, query, mode) VALUES (?, ?, ?)')
    .run(userId, query, mode);
  return getSearch(userId, Number(info.lastInsertRowid));
}

export function getSearch(userId: number, searchId: number): CompanySearchDto {
  const row = db
    .prepare('SELECT * FROM company_searches WHERE id = ? AND user_id = ?')
    .get(searchId, userId) as CompanySearchRow | undefined;
  if (!row) throw HttpError.notFound('Search not found');
  return toDto(row);
}

/** Internal lookup (no ownership filter) for the background pipeline. */
export function getSearchRow(searchId: number): CompanySearchRow {
  const row = db.prepare('SELECT * FROM company_searches WHERE id = ?').get(searchId) as
    | CompanySearchRow
    | undefined;
  if (!row) throw HttpError.notFound('Search not found');
  return row;
}

export function listSearches(userId: number, limit = 10): CompanySearchDto[] {
  const rows = db
    .prepare('SELECT * FROM company_searches WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as CompanySearchRow[];
  return rows.map(toDto);
}

export function setSearchStatus(searchId: number, status: SearchStatus, error?: string | null): void {
  db.prepare('UPDATE company_searches SET status = ?, error = ? WHERE id = ?').run(
    status,
    error ?? null,
    searchId
  );
}

export function setSearchPlan(searchId: number, plan: SearchPlan): void {
  db.prepare('UPDATE company_searches SET plan_json = ? WHERE id = ?').run(
    JSON.stringify(plan),
    searchId
  );
}

/** Persist final results and settle the row as success. */
export function setSearchResults(searchId: number, results: SearchResultCompany[]): void {
  db.prepare(
    `UPDATE company_searches
     SET results_json = ?, status = 'success', error = NULL, finished_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(results), searchId);
}

export function failSearch(searchId: number, error: string): void {
  db.prepare(
    `UPDATE company_searches
     SET status = 'failed', error = ?, finished_at = datetime('now')
     WHERE id = ?`
  ).run(error, searchId);
}

/** Boot recovery: settle any search left 'running'/'pending' by a restart. */
export function recoverInterruptedSearches(): void {
  db.prepare(
    `UPDATE company_searches
     SET status = 'failed', error = 'Interrupted by server restart — search again',
         finished_at = datetime('now')
     WHERE status IN ('running', 'pending')`
  ).run();
}
