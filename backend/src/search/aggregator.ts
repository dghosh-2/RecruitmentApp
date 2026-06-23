import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getOpenAI } from '../scraping/openaiClient.js';
import {
  aggregatorOutputSchema,
  type AgentCompany,
  type SearchMode,
  type SearchResultCompany,
} from './types.js';

/**
 * Orchestrator 2 (aggregator). Concatenates every sub-agent's findings, dedupes
 * by normalized company name, drops companies the user already tracks, then makes
 * a final LLM pass to relevance-filter, rank, and write ONE concise reason per
 * company. If the final LLM pass is unavailable, it falls back to the deduped
 * candidate list so the search still returns useful results.
 */

const STOP_WORDS = new Set(['inc', 'llc', 'ltd', 'corp', 'co', 'the', 'company', 'corporation', 'group']);

/** Normalized key for dedupe: "Susquehanna Int'l Group, LLP" -> "susquehanna international". */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

interface Candidate {
  name: string;
  website: string | null;
  reasons: string[];
}

/** Merge duplicate companies (same normalized name) and exclude tracked ones. */
function dedupe(companies: AgentCompany[], trackedKeys: Set<string>): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of companies) {
    const key = nameKey(c.name);
    if (!key || trackedKeys.has(key)) continue;
    const existing = byKey.get(key);
    if (existing) {
      if (c.reason) existing.reasons.push(c.reason);
      if (!existing.website && c.website) existing.website = c.website;
    } else {
      byKey.set(key, { name: c.name, website: c.website, reasons: c.reason ? [c.reason] : [] });
    }
  }
  return [...byKey.values()];
}

const AGGREGATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    companies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          website: { type: ['string', 'null'] },
          reason: {
            type: 'string',
            description: 'One concise sentence on why this company fits the user request.',
          },
        },
        required: ['name', 'website', 'reason'],
      },
    },
  },
  required: ['companies'],
} as const;

export async function aggregateResults(
  query: string,
  agentCompanies: AgentCompany[],
  trackedCompanyNames: string[],
  searchId: number,
  mode: SearchMode = 'thorough',
  exclusions: string[] = []
): Promise<SearchResultCompany[]> {
  // Both already-tracked companies and user-requested exclusions are dropped
  // by normalized name so "excluding Point72" works regardless of casing/suffix.
  const excludedKeys = new Set(
    [...trackedCompanyNames, ...exclusions].map(nameKey).filter(Boolean)
  );
  const candidates = dedupe(agentCompanies, excludedKeys);
  const maxResults = Math.max(1, env.searchMaxResults);

  logger.info('Aggregator: candidates deduped', {
    searchId,
    mode,
    rawCompanies: agentCompanies.length,
    uniqueCandidates: candidates.length,
    excludedTracked: trackedCompanyNames.length,
    userExclusions: exclusions.length,
  });

  if (candidates.length === 0) return [];

  // Fallback if the ranking LLM call can't run or fails.
  const fallback: SearchResultCompany[] = candidates.slice(0, maxResults).map((c) => ({
    name: c.name,
    website: c.website,
    reason: c.reasons[0] ?? 'Suggested by company research.',
  }));

  // Fast mode: skip the ranking LLM pass. Rank by how many agents surfaced each
  // company (a cheap confidence proxy) and reuse the agent's own reason.
  if (mode === 'fast') {
    const ranked = [...candidates]
      .sort((a, b) => b.reasons.length - a.reasons.length)
      .slice(0, maxResults)
      .map((c) => ({
        name: c.name,
        website: c.website,
        reason: c.reasons[0] ?? 'Suggested by company research.',
      }));
    logger.info('Aggregator: fast merge complete', { searchId, returned: ranked.length });
    return ranked;
  }

  try {
    const openai = getOpenAI();
    const candidateList = candidates
      .map(
        (c, i) =>
          `${i + 1}. ${c.name}${c.website ? ` (${c.website})` : ''}\n   reasons: ${c.reasons.join(' | ')}`
      )
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: env.searchModel,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'final_companies', strict: true, schema: AGGREGATOR_SCHEMA },
      },
      messages: [
        {
          role: 'system',
          content:
            'You are the final aggregation orchestrator for a company-discovery system. ' +
            'You receive a deduplicated list of candidate companies (with the reasons various ' +
            'research agents suggested them) and the original user request. ' +
            'Select and RANK the companies that genuinely fit the request, dropping any that are ' +
            `off-topic or implausible. Return at most ${maxResults} companies, best first. ` +
            'For each, write ONE concise sentence (max ~25 words) explaining why it fits the ' +
            'user\'s request. Preserve the company name and website from the candidate list; ' +
            'use null for website when none was provided. Do not invent new companies.',
        },
        {
          role: 'user',
          content: `User request: "${query}"\n\nCandidate companies:\n${candidateList}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = aggregatorOutputSchema.safeParse(JSON.parse(content));
      if (parsed.success && parsed.data.companies.length > 0) {
        const ranked = parsed.data.companies.slice(0, maxResults);
        logger.info('Aggregator: ranking complete', { searchId, returned: ranked.length });
        return ranked;
      }
    }
    logger.warn('Aggregator: ranking output unusable, using fallback', { searchId });
  } catch (err) {
    logger.warn('Aggregator: ranking LLM call failed, using fallback', {
      searchId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return fallback;
}
