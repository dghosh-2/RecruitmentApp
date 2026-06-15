import { env } from '../config/env.js';
import type { Preference } from '../services/authService.js';
import { logger } from '../utils/logger.js';
import { getOpenAI } from '../scraping/openaiClient.js';
import {
  plannerOutputSchema,
  type ResearchTask,
  type SearchMode,
  type SearchPlan,
} from './types.js';

/**
 * Orchestrator 1 (planner / delegator).
 *
 * Builds a research plan from the user's natural-language query. Three STANDARD
 * tasks are constructed in code so the baseline agent count is guaranteed
 * regardless of the LLM. An LLM call then adds 0..SEARCH_MAX_EXTRA_AGENTS
 * additional specialized tasks, sized to query intensity — more sub-agents for
 * richer/multi-constraint requests.
 */

const PREFERENCE_HINT: Record<Preference, string> = {
  internship: 'The user is focused on internships / early-career roles.',
  full_time: 'The user is focused on full-time roles.',
  both: 'The user is open to both internships and full-time roles.',
};

function standardTasks(query: string, preference: Preference): ResearchTask[] {
  const pref = PREFERENCE_HINT[preference];
  return [
    {
      angle: 'direct_match',
      focus: 'Direct matches',
      instructions:
        `Find well-known, obvious companies that directly match this request: "${query}". ${pref} ` +
        'Prioritize the most relevant and reputable employers a candidate would immediately think of.',
    },
    {
      angle: 'adjacent',
      focus: 'Adjacent / less-obvious players',
      instructions:
        `Find lesser-known, up-and-coming, or adjacent companies relevant to: "${query}". ${pref} ` +
        'Avoid the most obvious names; surface strong but under-the-radar employers in the same or neighboring space.',
    },
    {
      angle: 'constraint',
      focus: 'Constraint-focused',
      instructions:
        `Identify the specific constraints in this request and find companies that satisfy them: "${query}". ${pref} ` +
        'Examples of constraints: location/remote, visa sponsorship, no high-GPA requirement, company size, mission. ' +
        'Only include companies that plausibly meet the stated constraints.',
    },
  ];
}

const PLANNER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent_summary: {
      type: 'string',
      description: 'One-sentence restatement of what kind of companies the user wants.',
    },
    constraints: {
      type: 'array',
      items: { type: 'string' },
      description: 'Distinct hard/soft constraints extracted from the query (may be empty).',
    },
    extra_tasks: {
      type: 'array',
      description:
        'ADDITIONAL specialized research angles BEYOND the three standard ones ' +
        '(direct matches, adjacent players, constraint-focused). Add more for ' +
        'richer or multi-faceted queries, fewer (or none) for simple ones.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          angle: { type: 'string', enum: ['dynamic'] },
          focus: { type: 'string', description: 'Short label, e.g. "European hubs" or "Quant HFT shops".' },
          instructions: {
            type: 'string',
            description: 'A concrete brief telling a research agent exactly what companies to look for.',
          },
        },
        required: ['angle', 'focus', 'instructions'],
      },
    },
  },
  required: ['intent_summary', 'constraints', 'extra_tasks'],
} as const;

/**
 * Fast mode: a small fixed fan-out (direct matches + constraint-focused) with NO
 * planner LLM call. Two agents still run concurrently for breadth, but the slow
 * plan-generation round-trip is skipped entirely.
 */
function fastPlan(query: string, preference: Preference, searchId: number): SearchPlan {
  const standard = standardTasks(query, preference);
  const tasks = [standard[0], standard[2]]; // direct_match + constraint
  logger.info('Planner: fast plan ready', { searchId, totalTasks: tasks.length });
  return { intentSummary: '', constraints: [], tasks };
}

export async function planResearch(
  query: string,
  preference: Preference,
  searchId: number,
  mode: SearchMode = 'thorough'
): Promise<SearchPlan> {
  if (mode === 'fast') return fastPlan(query, preference, searchId);

  const standard = standardTasks(query, preference);
  const maxExtra = Math.max(0, env.searchMaxExtraAgents);

  let intentSummary = '';
  let constraints: string[] = [];
  let extraTasks: ResearchTask[] = [];

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: env.searchModel,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'research_plan', strict: true, schema: PLANNER_SCHEMA },
      },
      messages: [
        {
          role: 'system',
          content:
            'You are the planning orchestrator for a company-discovery system. ' +
            'A user describes the kind of EMPLOYERS they want to find (not specific jobs). ' +
            'Three standard research agents always run: direct matches, adjacent/less-obvious ' +
            'players, and constraint-focused. Your job is to decide what ADDITIONAL specialized ' +
            `research angles would help, and return at most ${maxExtra} extra tasks. ` +
            'Scale the number of extra tasks to the complexity of the request: a simple query ' +
            'may need zero extra tasks; an intensive, multi-constraint query should get more. ' +
            'Each extra task must be a distinct angle (e.g. geography, sub-sector, company size, ' +
            'business model) — never duplicate the three standard angles.',
        },
        {
          role: 'user',
          content: `User preference: ${PREFERENCE_HINT[preference]}\nQuery: "${query}"`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      const parsed = plannerOutputSchema.safeParse(JSON.parse(content));
      if (parsed.success) {
        intentSummary = parsed.data.intent_summary;
        constraints = parsed.data.constraints;
        extraTasks = parsed.data.extra_tasks.slice(0, maxExtra).map((t) => ({
          ...t,
          angle: 'dynamic' as const,
        }));
      } else {
        logger.warn('Planner: LLM output failed schema validation, using standard tasks only', {
          searchId,
        });
      }
    }
  } catch (err) {
    // Planner is best-effort: if the extra-task LLM call fails, the three
    // standard agents still run, so the search degrades gracefully.
    logger.warn('Planner: extra-task generation failed, using standard tasks only', {
      searchId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const tasks = [...standard, ...extraTasks];
  logger.info('Planner: research plan ready', {
    searchId,
    standardTasks: standard.length,
    extraTasks: extraTasks.length,
    totalTasks: tasks.length,
  });

  return { intentSummary, constraints, tasks };
}
