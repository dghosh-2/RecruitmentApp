import { env, hasOpenAI } from '../config/env.js';
import { getUserById } from '../services/authService.js';
import {
  createCompany,
  getCompanyByName,
  getCompanyRow,
  listCompanies,
} from '../services/companyService.js';
import { getOrCreateIndustry } from '../services/industryService.js';
import { listListings } from '../services/listingService.js';
import {
  failSearch,
  getSearchRow,
  setSearchCompanies,
  setSearchJobs,
  setSearchPhase,
  setSearchPlan,
  setSearchStatus,
  settleSearchSuccess,
} from '../services/searchService.js';
import { scrapeCompany } from '../scraping/pipeline.js';
import { logger } from '../utils/logger.js';
import { aggregateResults } from './aggregator.js';
import { runWithConcurrency } from './concurrency.js';
import { searchQueue } from './pipeline.js';
import { planResearch } from './planner.js';
import { researchCompanies } from './researcher.js';
import type { AgentCompany, AutoCompanyResult, SearchResultCompany } from './types.js';

/** Dedicated industry that auto ("Assistant") runs file discovered companies under. */
export const AUTO_INDUSTRY_NAME = 'AI Finds';

/**
 * The all-in-one Assistant run. One natural-language prompt drives the entire
 * app end to end:
 *   plan + research (reuse discovery agents) -> aggregate ranked companies
 *   (honoring user exclusions + already-tracked companies) -> persist them under
 *   the "AI Finds" industry -> scrape each for internships via the normal
 *   pipeline (scrapeCompany(id, 'internship')) -> collect the internship
 *   listings into a per-company snapshot for the UI.
 *
 * Re-running naturally surfaces NEW companies: once persisted, "AI Finds"
 * companies are tracked, so the aggregator excludes them next time — exactly the
 * "I've exhausted my list, find me more" use case.
 */
export async function runAutoSearch(searchId: number): Promise<void> {
  const started = Date.now();
  const row = getSearchRow(searchId);
  const user = getUserById(row.user_id);

  setSearchStatus(searchId, 'running');
  setSearchPhase(searchId, 'planning');
  logger.info('Auto: started', { searchId, userId: row.user_id, mode: row.mode, query: row.query });

  try {
    if (!hasOpenAI()) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Add it to the root .env file to enable the Assistant.'
      );
    }

    // Phase 1: plan, then fan out research sub-agents (same engine as Discover).
    const plan = await planResearch(row.query, user.preference, searchId, row.mode);
    setSearchPlan(searchId, plan);
    setSearchPhase(searchId, 'researching');

    const settled = await runWithConcurrency(
      plan.tasks.map((task) => () => researchCompanies(task, row.query, searchId)),
      env.searchAgentConcurrency
    );
    const agentCompanies: AgentCompany[] = [];
    for (const result of settled) if (result.ok) agentCompanies.push(...result.value);

    // Phase 2: aggregate -> ranked companies, excluding tracked + user exclusions.
    const trackedNames = listCompanies(row.user_id).map((c) => c.name);
    const ranked = (
      await aggregateResults(row.query, agentCompanies, trackedNames, searchId, row.mode, plan.exclusions)
    ).slice(0, Math.max(1, env.autoMaxCompanies));
    setSearchCompanies(searchId, ranked);

    if (ranked.length === 0) {
      setSearchJobs(searchId, []);
      setSearchPhase(searchId, 'done');
      settleSearchSuccess(searchId);
      logger.info('Auto: no companies to scrape', { searchId });
      return;
    }

    // Phase 3: persist companies under "AI Finds", then scrape each for interns.
    setSearchPhase(searchId, 'scraping');
    const industry = getOrCreateIndustry(row.user_id, AUTO_INDUSTRY_NAME);

    // Reuse an existing company row (by name) so re-runs don't create duplicates.
    // We intentionally do NOT seed careers_url from the research website — let
    // discovery resolve the real careers page instead of scraping a homepage.
    const targets = ranked.map((result: SearchResultCompany) => {
      const existing = getCompanyByName(row.user_id, result.name);
      const company = existing ?? createCompany(row.user_id, industry.id, result.name);
      return { result, companyId: company.id };
    });

    await runWithConcurrency(
      targets.map(({ companyId }) => () => scrapeCompany(companyId, 'internship')),
      env.scrapeConcurrency
    );

    // Phase 4: collect each company's internship listings into the snapshot.
    const jobs: AutoCompanyResult[] = targets.map(({ companyId }) => {
      const company = getCompanyRow(companyId);
      const listings = listListings(row.user_id, {
        companyId,
        employmentType: 'internship',
        status: 'active',
      }) as { title: string; url: string | null; location: string | null }[];
      return {
        companyId,
        companyName: company.name,
        careersUrl: company.careers_url,
        discoveryStatus: company.discovery_status,
        scrapeStatus: company.last_scrape_status,
        error: company.last_scrape_error,
        listings: listings.map((l) => ({ title: l.title, url: l.url, location: l.location })),
      };
    });

    setSearchJobs(searchId, jobs);
    setSearchPhase(searchId, 'done');
    settleSearchSuccess(searchId);

    const totalJobs = jobs.reduce((sum, j) => sum + j.listings.length, 0);
    logger.info('Auto: complete', {
      searchId,
      companies: jobs.length,
      totalJobs,
      ms: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failSearch(searchId, message);
    logger.error('Auto: failed', { searchId, error: message });
  }
}

export function enqueueAutoSearch(searchId: number): void {
  searchQueue.enqueue(`auto:${searchId}`, () => runAutoSearch(searchId));
}
