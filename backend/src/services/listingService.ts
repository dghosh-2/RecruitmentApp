import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';
import type { NormalizedListing } from '../scraping/types.js';

export function fingerprintListing(title: string, url: string | null, location: string | null) {
  const key = `${title.toLowerCase().trim()}|${(url ?? location ?? '').toLowerCase().trim()}`;
  return crypto.createHash('sha1').update(key).digest('hex');
}

const SELECT_LISTING = `
  SELECT
    l.id,
    l.company_id AS companyId,
    c.name AS companyName,
    l.title,
    l.url,
    l.location,
    l.employment_type AS employmentType,
    l.team,
    l.status,
    l.first_seen_at AS firstSeenAt,
    l.last_seen_at AS lastSeenAt
  FROM listings l
  JOIN companies c ON c.id = l.company_id
`;

export interface ListingFilters {
  companyId?: number;
  status?: 'new' | 'seen' | 'deleted' | 'active'; // active = new + seen
  employmentType?: 'internship' | 'full_time' | 'part_time' | 'contract' | 'unknown';
  preference?: 'internship' | 'full_time' | 'both';
}

export function listListings(userId: number, filters: ListingFilters) {
  const clauses: string[] = ['l.user_id = ?'];
  const params: unknown[] = [userId];

  if (filters.companyId !== undefined) {
    clauses.push('l.company_id = ?');
    params.push(filters.companyId);
  }

  if (filters.status === 'active') {
    clauses.push("l.status != 'deleted'");
  } else if (filters.status) {
    clauses.push('l.status = ?');
    params.push(filters.status);
  } else {
    clauses.push("l.status != 'deleted'");
  }

  if (filters.employmentType === 'full_time') {
    // Unlabeled roles on custom career sites are usually full-time; include
    // them so the filter never hides real jobs.
    clauses.push("l.employment_type IN ('full_time', 'contract', 'unknown')");
  } else if (filters.employmentType) {
    clauses.push('l.employment_type = ?');
    params.push(filters.employmentType);
  } else if (filters.preference === 'internship') {
    // Include unknowns so AI-extracted listings without a clear type are not hidden.
    clauses.push("l.employment_type IN ('internship', 'unknown')");
  } else if (filters.preference === 'full_time') {
    clauses.push("l.employment_type IN ('full_time', 'contract', 'unknown')");
  }

  return db
    .prepare(`${SELECT_LISTING} WHERE ${clauses.join(' AND ')} ORDER BY l.first_seen_at DESC, l.title`)
    .all(...params);
}

export function updateListingStatus(userId: number, listingId: number, status: 'new' | 'seen' | 'deleted') {
  const info = db
    .prepare('UPDATE listings SET status = ? WHERE id = ? AND user_id = ?')
    .run(status, listingId, userId);
  if (info.changes === 0) throw HttpError.notFound('Listing not found');
  return db.prepare(`${SELECT_LISTING} WHERE l.id = ?`).get(listingId);
}

export function markAllSeen(userId: number, companyId?: number) {
  if (companyId !== undefined) {
    return db
      .prepare("UPDATE listings SET status = 'seen' WHERE user_id = ? AND company_id = ? AND status = 'new'")
      .run(userId, companyId).changes;
  }
  return db
    .prepare("UPDATE listings SET status = 'seen' WHERE user_id = ? AND status = 'new'")
    .run(userId).changes;
}

/**
 * Upserts scraped listings. Returns the listings that are net-new this run.
 * Existing rows (including deleted ones) only get last_seen_at refreshed,
 * so a deleted listing never resurfaces.
 */
export function upsertListings(
  companyId: number,
  userId: number,
  listings: NormalizedListing[]
): { id: number; title: string; url: string | null; location: string | null }[] {
  const insert = db.prepare(
    `INSERT INTO listings (company_id, user_id, title, url, location, employment_type, team, fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (company_id, fingerprint)
     DO UPDATE SET last_seen_at = datetime('now')`
  );

  const newOnes: { id: number; title: string; url: string | null; location: string | null }[] = [];

  const run = db.transaction((items: NormalizedListing[]) => {
    for (const item of items) {
      const before = db
        .prepare('SELECT id FROM listings WHERE company_id = ? AND fingerprint = ?')
        .get(companyId, item.fingerprint) as { id: number } | undefined;

      insert.run(
        companyId,
        userId,
        item.title,
        item.url,
        item.location,
        item.employmentType,
        item.team,
        item.fingerprint
      );

      if (!before) {
        const row = db
          .prepare('SELECT id FROM listings WHERE company_id = ? AND fingerprint = ?')
          .get(companyId, item.fingerprint) as { id: number };
        newOnes.push({ id: row.id, title: item.title, url: item.url, location: item.location });
      }
    }
  });

  run(listings);
  return newOnes;
}
