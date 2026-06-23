import { db } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';

export interface IndustryRow {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

export function listIndustries(userId: number) {
  return db
    .prepare('SELECT id, name, created_at AS createdAt FROM industries WHERE user_id = ? ORDER BY name')
    .all(userId);
}

export function createIndustry(userId: number, name: string) {
  const existing = db
    .prepare('SELECT id FROM industries WHERE user_id = ? AND name = ?')
    .get(userId, name);
  if (existing) throw HttpError.conflict('Industry already exists');

  const info = db.prepare('INSERT INTO industries (user_id, name) VALUES (?, ?)').run(userId, name);
  return db
    .prepare('SELECT id, name, created_at AS createdAt FROM industries WHERE id = ?')
    .get(Number(info.lastInsertRowid));
}

/** Idempotent: return the user's industry with this name, creating it if absent. */
export function getOrCreateIndustry(userId: number, name: string): { id: number; name: string } {
  const existing = db
    .prepare('SELECT id, name FROM industries WHERE user_id = ? AND name = ?')
    .get(userId, name) as { id: number; name: string } | undefined;
  if (existing) return existing;

  const info = db.prepare('INSERT INTO industries (user_id, name) VALUES (?, ?)').run(userId, name);
  return { id: Number(info.lastInsertRowid), name };
}

export function renameIndustry(userId: number, industryId: number, name: string) {
  const info = db
    .prepare('UPDATE industries SET name = ? WHERE id = ? AND user_id = ?')
    .run(name, industryId, userId);
  if (info.changes === 0) throw HttpError.notFound('Industry not found');
  return db
    .prepare('SELECT id, name, created_at AS createdAt FROM industries WHERE id = ?')
    .get(industryId);
}

export function deleteIndustry(userId: number, industryId: number) {
  const info = db
    .prepare('DELETE FROM industries WHERE id = ? AND user_id = ?')
    .run(industryId, userId);
  if (info.changes === 0) throw HttpError.notFound('Industry not found');
}

export function assertIndustryOwned(userId: number, industryId: number) {
  const row = db
    .prepare('SELECT id FROM industries WHERE id = ? AND user_id = ?')
    .get(industryId, userId);
  if (!row) throw HttpError.notFound('Industry not found');
}
