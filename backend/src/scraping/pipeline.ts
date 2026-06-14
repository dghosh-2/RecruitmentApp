import { env } from '../config/env.js';
import { sendNewListingsDigest } from '../email/index.js';
import { JobQueue } from '../jobs/queue.js';
import { getUserRowById } from '../services/authService.js';
import {
  getCompanyRow,
  setDiscoveryResult,
  setScrapeStatus,
  type CompanyRow,
} from '../services/companyService.js';
import { upsertListings } from '../services/listingService.js';
import { createScrapeRun, finishScrapeRun } from '../services/scrapeRunService.js';
import { logger } from '../utils/logger.js';
import { extractListingsWithAI } from './aiExtractor.js';
import { getAdapter } from './ats/index.js';
import { discoverCareersSource, resolveManualUrl } from './discovery.js';
import { normalizeListings } from './normalize.js';
import type { RawListing, ScrapeResult } from './types.js';

export const scrapeQueue = new JobQueue(env.scrapeConcurrency);

/** Scrape every opening, or only internship-type roles. */
export type ScrapeMode = 'all' | 'internship';

/**
 * Per-company + per-mode single-flight: a second request for the same company
 * AND mode awaits the in-flight one, while an "all" and an "internship" scrape
 * can still run independently.
 */
const inFlight = new Map<string, Promise<ScrapeResult>>();

export function scrapeCompany(companyId: number, mode: ScrapeMode = 'all'): Promise<ScrapeResult> {
  const key = `${companyId}:${mode}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = runScrape(companyId, mode).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

/**
 * Pick where to scrape from, given the mode.
 *  - internship + a dedicated intern_careers_url -> render that page (AI path).
 *  - otherwise -> the ATS API when known, else the general careers URL (AI path).
 * Internship results from any source are filtered to internship roles below.
 */
function resolveSource(
  company: CompanyRow,
  mode: ScrapeMode
): { kind: 'ats'; slug: string } | { kind: 'ai'; url: string } | null {
  if (mode === 'internship' && company.intern_careers_url) {
    return { kind: 'ai', url: company.intern_careers_url };
  }
  if (company.ats_type && company.ats_slug && getAdapter(company.ats_type)) {
    return { kind: 'ats', slug: company.ats_slug };
  }
  if (company.careers_url) {
    return { kind: 'ai', url: company.careers_url };
  }
  return null;
}

async function runScrape(companyId: number, mode: ScrapeMode): Promise<ScrapeResult> {
  let company = getCompanyRow(companyId);

  // Self-heal: if the company has no general careers source yet, attempt
  // discovery first. (A standalone intern_careers_url doesn't cover an "all"
  // scrape, so we still try to resolve the main source.)
  if (!company.careers_url && !company.ats_type) {
    await discoverForCompany(companyId);
    company = getCompanyRow(companyId);
  }

  const runId = createScrapeRun(companyId);
  setScrapeStatus(companyId, 'running');

  const internOnly = mode === 'internship';
  let method = 'none';
  let pagesCrawled = 0;

  try {
    const source = resolveSource(company, mode);
    if (!source) {
      throw new Error(
        'No careers page found for this company. Paste its careers URL on the company card.'
      );
    }

    let rawListings: RawListing[];
    let baseUrl: string;
    let warning: string | null = null;

    if (source.kind === 'ats') {
      const adapter = getAdapter(company.ats_type!)!;
      method = `ats:${adapter.type}`;
      rawListings = await adapter.fetchListings(source.slug);
      pagesCrawled = 1;
      baseUrl = adapter.boardUrl(source.slug);
    } else {
      method = 'ai';
      const result = await extractListingsWithAI(source.url);
      rawListings = result.listings;
      pagesCrawled = result.pagesCrawled;
      baseUrl = source.url;
      if (result.truncated) {
        warning = `Stopped at the SCRAPE_MAX_PAGES cap (${env.scrapeMaxPages}) with more pages remaining — some jobs were NOT scraped. Increase SCRAPE_MAX_PAGES in .env.`;
      }
    }

    if (internOnly) method += ' (interns)';

    let normalized = normalizeListings(rawListings, baseUrl);
    if (internOnly) {
      // Filter after classification so every source (ATS JSON or AI extraction)
      // is held to the same internship definition in scraping/internship.ts.
      normalized = normalized.filter((l) => l.employmentType === 'internship');
    }
    const newListings = upsertListings(companyId, company.user_id, normalized);

    if (newListings.length > 0) {
      const user = getUserRowById(company.user_id);
      if (user && user.notify_email === 1) {
        await sendNewListingsDigest(user.email, company.name, newListings).catch((err) =>
          logger.warn('Digest email failed', { error: err.message })
        );
      }
    }

    setScrapeStatus(companyId, 'success', warning);
    finishScrapeRun(runId, {
      status: 'success',
      method,
      pagesCrawled,
      listingsFound: normalized.length,
      listingsNew: newListings.length,
      error: warning,
    });

    logger.info('Scrape complete', {
      companyId,
      company: company.name,
      method,
      pagesCrawled,
      found: normalized.length,
      new: newListings.length,
    });

    return {
      status: 'success',
      method,
      pagesCrawled,
      listingsFound: normalized.length,
      listingsNew: newListings.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setScrapeStatus(companyId, 'failed', message);
    finishScrapeRun(runId, {
      status: 'failed',
      method,
      pagesCrawled,
      listingsFound: 0,
      listingsNew: 0,
      error: message,
    });
    logger.error('Scrape failed', { companyId, company: company.name, error: message });
    return {
      status: 'failed',
      method,
      pagesCrawled,
      listingsFound: 0,
      listingsNew: 0,
      error: message,
    };
  }
}

/** Run careers-source discovery for a company and persist the outcome. */
export async function discoverForCompany(companyId: number): Promise<CompanyRow> {
  const company = getCompanyRow(companyId);
  setDiscoveryResult(companyId, { status: 'searching' });

  try {
    if (company.careers_url) {
      // User supplied a URL — keep it, but check whether it maps to a known
      // ATS so we can use the structured JSON API instead of HTML parsing.
      const manual = resolveManualUrl(company.careers_url);
      setDiscoveryResult(companyId, {
        status: 'found',
        careersUrl: manual.careersUrl,
        atsType: manual.atsType,
        atsSlug: manual.atsSlug,
        method: 'manual',
      });
    } else {
      const result = await discoverCareersSource(company.name);
      if (result) {
        setDiscoveryResult(companyId, {
          status: 'found',
          careersUrl: result.careersUrl,
          atsType: result.atsType,
          atsSlug: result.atsSlug,
          method: result.method,
        });
      } else {
        setDiscoveryResult(companyId, { status: 'manual_needed' });
      }
    }
  } catch (err) {
    logger.error('Discovery failed', {
      companyId,
      error: err instanceof Error ? err.message : String(err),
    });
    setDiscoveryResult(companyId, {
      status: company.careers_url ? 'found' : 'manual_needed',
    });
  }

  return getCompanyRow(companyId);
}

/** Background flow when a company is added: discover, then scrape immediately. */
export function enqueueDiscoveryAndScrape(companyId: number, mode: ScrapeMode = 'all'): void {
  scrapeQueue.enqueue(`discover+scrape:${companyId}:${mode}`, async () => {
    const company = await discoverForCompany(companyId);
    if (company.careers_url || company.ats_type || company.intern_careers_url) {
      await scrapeCompany(companyId, mode);
    }
  });
}

export function enqueueScrape(companyId: number, mode: ScrapeMode = 'all'): void {
  scrapeQueue.enqueue(`scrape:${companyId}:${mode}`, async () => {
    await scrapeCompany(companyId, mode);
  });
}
