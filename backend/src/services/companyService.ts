import { db } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';

export interface CompanyRow {
  id: number;
  user_id: number;
  industry_id: number;
  name: string;
  careers_url: string | null;
  intern_careers_url: string | null;
  ats_type: string | null;
  ats_slug: string | null;
  discovery_status: 'pending' | 'searching' | 'found' | 'manual_needed';
  discovery_method: string | null;
  last_scrape_status: 'running' | 'success' | 'failed' | null;
  last_scraped_at: string | null;
  last_scrape_error: string | null;
  created_at: string;
}

/** Shape returned to the API (camelCase aliases from SELECT_COMPANY). */
export interface CompanyDto {
  id: number;
  industryId: number;
  name: string;
  careersUrl: string | null;
  internCareersUrl: string | null;
  atsType: string | null;
  atsSlug: string | null;
  discoveryStatus: 'pending' | 'searching' | 'found' | 'manual_needed';
  discoveryMethod: string | null;
  lastScrapeStatus: 'running' | 'success' | 'failed' | null;
  lastScrapedAt: string | null;
  lastScrapeError: string | null;
  createdAt: string;
  newListingCount: number;
  listingCount: number;
}

const SELECT_COMPANY = `
  SELECT
    c.id,
    c.industry_id AS industryId,
    c.name,
    c.careers_url AS careersUrl,
    c.intern_careers_url AS internCareersUrl,
    c.ats_type AS atsType,
    c.ats_slug AS atsSlug,
    c.discovery_status AS discoveryStatus,
    c.discovery_method AS discoveryMethod,
    c.last_scrape_status AS lastScrapeStatus,
    c.last_scraped_at AS lastScrapedAt,
    c.last_scrape_error AS lastScrapeError,
    c.created_at AS createdAt,
    (SELECT COUNT(*) FROM listings l WHERE l.company_id = c.id AND l.status = 'new') AS newListingCount,
    (SELECT COUNT(*) FROM listings l WHERE l.company_id = c.id AND l.status != 'deleted') AS listingCount
  FROM companies c
`;

export function listCompanies(userId: number, industryId?: number): CompanyDto[] {
  if (industryId !== undefined) {
    return db
      .prepare(`${SELECT_COMPANY} WHERE c.user_id = ? AND c.industry_id = ? ORDER BY c.name`)
      .all(userId, industryId) as CompanyDto[];
  }
  return db.prepare(`${SELECT_COMPANY} WHERE c.user_id = ? ORDER BY c.name`).all(userId) as CompanyDto[];
}

export function getCompany(userId: number, companyId: number): CompanyDto {
  const row = db
    .prepare(`${SELECT_COMPANY} WHERE c.id = ? AND c.user_id = ?`)
    .get(companyId, userId);
  if (!row) throw HttpError.notFound('Company not found');
  return row as CompanyDto;
}

export function getCompanyRow(companyId: number): CompanyRow {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) as
    | CompanyRow
    | undefined;
  if (!row) throw HttpError.notFound('Company not found');
  return row;
}

export function createCompany(
  userId: number,
  industryId: number,
  name: string,
  careersUrl?: string
) {
  const info = db
    .prepare(
      `INSERT INTO companies (user_id, industry_id, name, careers_url, discovery_status)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, industryId, name, careersUrl ?? null, careersUrl ? 'found' : 'pending');
  return getCompany(userId, Number(info.lastInsertRowid));
}

export function updateCompany(
  userId: number,
  companyId: number,
  updates: {
    name?: string;
    industryId?: number;
    careersUrl?: string | null;
    internCareersUrl?: string | null;
  }
) {
  getCompany(userId, companyId); // ownership check

  if (updates.name !== undefined) {
    db.prepare('UPDATE companies SET name = ? WHERE id = ?').run(updates.name, companyId);
  }
  if (updates.industryId !== undefined) {
    db.prepare('UPDATE companies SET industry_id = ? WHERE id = ?').run(
      updates.industryId,
      companyId
    );
  }
  if (updates.careersUrl !== undefined) {
    db.prepare(
      `UPDATE companies SET careers_url = ?, discovery_status = ?, discovery_method = ?
       WHERE id = ?`
    ).run(
      updates.careersUrl,
      updates.careersUrl ? 'found' : 'manual_needed',
      updates.careersUrl ? 'manual' : null,
      companyId
    );
  }
  if (updates.internCareersUrl !== undefined) {
    db.prepare('UPDATE companies SET intern_careers_url = ? WHERE id = ?').run(
      updates.internCareersUrl || null,
      companyId
    );
  }
  return getCompany(userId, companyId);
}

export function deleteCompany(userId: number, companyId: number) {
  const info = db
    .prepare('DELETE FROM companies WHERE id = ? AND user_id = ?')
    .run(companyId, userId);
  if (info.changes === 0) throw HttpError.notFound('Company not found');
}

export function setDiscoveryResult(
  companyId: number,
  result: {
    status: 'searching' | 'found' | 'manual_needed';
    careersUrl?: string | null;
    atsType?: string | null;
    atsSlug?: string | null;
    method?: string | null;
  }
) {
  db.prepare(
    `UPDATE companies
     SET discovery_status = ?,
         careers_url = COALESCE(?, careers_url),
         ats_type = ?,
         ats_slug = ?,
         discovery_method = COALESCE(?, discovery_method)
     WHERE id = ?`
  ).run(
    result.status,
    result.careersUrl ?? null,
    result.atsType ?? null,
    result.atsSlug ?? null,
    result.method ?? null,
    companyId
  );
}

/** Wipe the careers source so discovery can run again from scratch. */
export function clearCareersSource(companyId: number): void {
  db.prepare(
    `UPDATE companies
     SET careers_url = NULL, ats_type = NULL, ats_slug = NULL,
         discovery_status = 'pending', discovery_method = NULL
     WHERE id = ?`
  ).run(companyId);
}

export function setScrapeStatus(
  companyId: number,
  status: 'running' | 'success' | 'failed',
  error?: string | null
) {
  db.prepare(
    `UPDATE companies
     SET last_scrape_status = ?, last_scraped_at = datetime('now'), last_scrape_error = ?
     WHERE id = ?`
  ).run(status, error ?? null, companyId);
}
