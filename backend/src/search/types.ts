import { z } from 'zod';

/**
 * Zod schemas for the multi-agent company-discovery pipeline. These double as
 * the structured-output contracts for every LLM call (Zod stands in for Pydantic
 * here), so each agent's output is validated before it flows downstream.
 */

/** Discovery depth: 'fast' (small fan-out, no orchestrator LLM calls) or 'thorough'. */
export type SearchMode = 'fast' | 'thorough';

/** What kind of research angle a sub-agent is pursuing. */
export const RESEARCH_ANGLES = [
  'direct_match',
  'adjacent',
  'constraint',
  'dynamic',
] as const;
export type ResearchAngle = (typeof RESEARCH_ANGLES)[number];

/**
 * One unit of work handed to a research sub-agent by Orchestrator 1.
 * `focus` is a short label; `instructions` is the natural-language brief the
 * agent uses to drive its web search.
 */
export const researchTaskSchema = z.object({
  angle: z.enum(RESEARCH_ANGLES),
  focus: z.string().min(1).max(120),
  instructions: z.string().min(1).max(600),
});
export type ResearchTask = z.infer<typeof researchTaskSchema>;

/** The dynamic-task list Orchestrator 1's LLM call returns. */
export const plannerOutputSchema = z.object({
  intent_summary: z.string().max(400).default(''),
  constraints: z.array(z.string().max(160)).max(20).default([]),
  exclusions: z.array(z.string().max(160)).max(40).default([]),
  extra_tasks: z.array(researchTaskSchema).max(12).default([]),
});
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

/** A company as proposed by a single research sub-agent. */
export const agentCompanySchema = z.object({
  name: z.string().min(1).max(160),
  website: z.string().max(300).nullable().default(null),
  reason: z.string().min(1).max(400),
});
export type AgentCompany = z.infer<typeof agentCompanySchema>;

/** A research sub-agent's full structured response. */
export const researcherOutputSchema = z.object({
  companies: z.array(agentCompanySchema).max(40).default([]),
});
export type ResearcherOutput = z.infer<typeof researcherOutputSchema>;

/** A company in the final, deduped, ranked list returned to the user. */
export const searchResultCompanySchema = z.object({
  name: z.string().min(1).max(160),
  website: z.string().max(300).nullable().default(null),
  reason: z.string().min(1).max(400),
});
export type SearchResultCompany = z.infer<typeof searchResultCompanySchema>;

/** Orchestrator 2's final structured output. */
export const aggregatorOutputSchema = z.object({
  companies: z.array(searchResultCompanySchema).max(50).default([]),
});
export type AggregatorOutput = z.infer<typeof aggregatorOutputSchema>;

/** Snapshot of the plan stored on the search row for transparency/debugging. */
export interface SearchPlan {
  intentSummary: string;
  constraints: string[];
  /** Company names the user explicitly asked to exclude (e.g. "excluding Point72"). */
  exclusions: string[];
  tasks: ResearchTask[];
}

/** One company's scraped-internship results in an auto ("Assistant") run. */
export interface AutoJobListing {
  title: string;
  url: string | null;
  location: string | null;
}

export interface AutoCompanyResult {
  companyId: number;
  companyName: string;
  careersUrl: string | null;
  discoveryStatus: 'pending' | 'searching' | 'found' | 'manual_needed';
  scrapeStatus: 'running' | 'success' | 'failed' | null;
  error: string | null;
  listings: AutoJobListing[];
}

/** Phases of the multi-step auto run, surfaced to the UI for progress. */
export type AutoPhase = 'planning' | 'researching' | 'scraping' | 'done';
