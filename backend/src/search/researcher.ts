import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getOpenAI } from '../scraping/openaiClient.js';
import { researcherOutputSchema, type AgentCompany, type ResearchTask } from './types.js';

/**
 * A single research sub-agent. Given one ResearchTask, it uses the OpenAI
 * Responses API with the web_search_preview tool (same mechanism as careers-page
 * discovery) to find real companies for its assigned angle, and returns a
 * Zod-validated list of { name, website, reason }.
 *
 * The Responses API + web_search tool returns free text, so we instruct strict
 * JSON output and extract/validate it ourselves rather than relying on a schema
 * the tool path may not honor.
 */

const OUTPUT_CONTRACT =
  'Respond with ONLY a JSON object (no markdown, no prose) of the exact shape: ' +
  '{"companies":[{"name":string,"website":string|null,"reason":string}]}. ' +
  'Each "reason" must be a single concise sentence (max ~25 words) explaining why ' +
  'the company fits THIS angle and the user\'s request. Use null for website if unknown. ' +
  'Only include real companies that genuinely have hiring/careers presence. ' +
  'Never invent companies. Return at most 12 companies.';

/** Pull the first balanced JSON object out of a possibly-noisy model response. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function researchCompanies(
  task: ResearchTask,
  query: string,
  searchId: number
): Promise<AgentCompany[]> {
  const openai = getOpenAI();
  const started = Date.now();

  const response = await openai.responses.create({
    model: env.searchModel,
    tools: [{ type: 'web_search_preview' }],
    input: [
      {
        role: 'system',
        content:
          'You are a company-research agent. You find EMPLOYERS (companies) a candidate ' +
          'should consider applying to — not individual job postings. Use web search to ground ' +
          'your answer in real, current companies. ' +
          OUTPUT_CONTRACT,
      },
      {
        role: 'user',
        content:
          `Original user request: "${query}"\n\n` +
          `Your research angle: ${task.focus}\n` +
          `Instructions: ${task.instructions}`,
      },
    ],
  });

  const text = response.output_text?.trim() ?? '';
  const json = extractJsonObject(text);
  if (!json) {
    logger.warn('Researcher: no JSON object in response', { searchId, focus: task.focus });
    return [];
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(json);
  } catch {
    logger.warn('Researcher: response JSON parse failed', { searchId, focus: task.focus });
    return [];
  }

  const parsed = researcherOutputSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    logger.warn('Researcher: output failed schema validation', { searchId, focus: task.focus });
    return [];
  }

  logger.info('Researcher: agent complete', {
    searchId,
    angle: task.angle,
    focus: task.focus,
    companies: parsed.data.companies.length,
    ms: Date.now() - started,
  });

  return parsed.data.companies;
}
