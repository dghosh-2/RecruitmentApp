import { env, hasOpenAI } from '../config/env.js';
import { JobQueue } from '../jobs/queue.js';
import { getUserById } from '../services/authService.js';
import { listCompanies } from '../services/companyService.js';
import {
  failSearch,
  getSearchRow,
  setSearchPlan,
  setSearchResults,
  setSearchStatus,
} from '../services/searchService.js';
import { logger } from '../utils/logger.js';
import { aggregateResults } from './aggregator.js';
import { runWithConcurrency } from './concurrency.js';
import { planResearch } from './planner.js';
import { researchCompanies } from './researcher.js';
import type { AgentCompany } from './types.js';

/** Bounded queue for top-level search jobs (the seam mirrors scrapeQueue). */
export const searchQueue = new JobQueue(env.searchConcurrency);

/**
 * Run one NL company-discovery search end to end:
 *   Orchestrator 1 (plan) -> concurrent research sub-agents -> Orchestrator 2
 *   (aggregate) -> persist results.
 * Every phase is logged with the searchId for traceability (our lightweight
 * stand-in for a tracing platform).
 */
export async function runSearch(searchId: number): Promise<void> {
  const started = Date.now();
  const row = getSearchRow(searchId);
  const user = getUserById(row.user_id);

  setSearchStatus(searchId, 'running');
  logger.info('Search: started', {
    searchId,
    userId: row.user_id,
    mode: row.mode,
    query: row.query,
  });

  try {
    if (!hasOpenAI()) {
      throw new Error(
        'OPENAI_API_KEY is not configured. Add it to the root .env file to enable company discovery.'
      );
    }

    // Orchestrator 1: build the research plan. Fast mode uses a small fixed
    // fan-out with no planner LLM call; thorough adds dynamic agents.
    const plan = await planResearch(row.query, user.preference, searchId, row.mode);
    setSearchPlan(searchId, plan);

    // Fan out: research sub-agents run concurrently with bounded concurrency.
    logger.info('Search: dispatching research agents', {
      searchId,
      mode: row.mode,
      agents: plan.tasks.length,
      concurrency: env.searchAgentConcurrency,
    });
    const settled = await runWithConcurrency(
      plan.tasks.map((task) => () => researchCompanies(task, row.query, searchId)),
      env.searchAgentConcurrency
    );

    const agentCompanies: AgentCompany[] = [];
    let failedAgents = 0;
    for (const result of settled) {
      if (result.ok) agentCompanies.push(...result.value);
      else failedAgents++;
    }
    if (failedAgents > 0) {
      logger.warn('Search: some research agents failed', { searchId, failedAgents });
    }

    // Orchestrator 2: dedupe, exclude already-tracked companies, rank.
    const trackedNames = listCompanies(row.user_id).map((c) => c.name);
    const results = await aggregateResults(
      row.query,
      agentCompanies,
      trackedNames,
      searchId,
      row.mode,
      plan.exclusions
    );

    setSearchResults(searchId, results);
    logger.info('Search: complete', {
      searchId,
      mode: row.mode,
      results: results.length,
      agentsRun: plan.tasks.length,
      ms: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failSearch(searchId, message);
    logger.error('Search: failed', { searchId, error: message });
  }
}

export function enqueueSearch(searchId: number): void {
  searchQueue.enqueue(`search:${searchId}`, () => runSearch(searchId));
}
