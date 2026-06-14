import { env, hasOpenAI } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { atsAdapters, detectAtsFromUrl } from './ats/index.js';
import { getOpenAI } from './openaiClient.js';

export interface DiscoveryResult {
  careersUrl: string;
  atsType: string | null;
  atsSlug: string | null;
  method: 'ats_probe' | 'openai_search' | 'manual';
}

const STOP_WORDS = new Set(['inc', 'llc', 'ltd', 'corp', 'co', 'the', 'company', 'corporation']);

/** "Acme Robotics Inc." -> ["acmerobotics", "acme-robotics", "acme"] */
export function slugCandidates(companyName: string): string[] {
  const words = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  const candidates = new Set<string>([words.join(''), words.join('-')]);
  if (words.length > 1) candidates.add(words[0]);
  return [...candidates];
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Does the board's self-reported name plausibly refer to this company?
 * e.g. "susquehanna international group" vs "Susquehanna International Group, LLP" -> true
 *      "google" vs "Nancy's Hair Salon" -> false
 */
export function boardNameMatches(companyName: string, boardName: string): boolean {
  const wanted = nameTokens(companyName);
  const actual = new Set(nameTokens(boardName));
  if (wanted.length === 0 || actual.size === 0) return false;
  const overlap = wanted.filter((t) => actual.has(t)).length;
  return overlap / Math.min(wanted.length, actual.size) >= 0.5;
}

/** Ask OpenAI whether a job board belongs to the company (for ATSes with no name in their API). */
async function confirmBoardWithAI(
  companyName: string,
  boardUrl: string,
  sampleTitles: string[]
): Promise<boolean> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: env.openaiModel,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You verify whether a job board belongs to a specific company. ' +
          'The board URL contains a company slug; consider whether the slug and sample ' +
          'job titles are consistent with the named company (its industry, scale, role types). ' +
          'Respond with exactly YES or NO.',
      },
      {
        role: 'user',
        content: `Company: "${companyName}"\nBoard URL: ${boardUrl}\nSample job titles:\n${sampleTitles
          .map((t) => `- ${t}`)
          .join('\n')}`,
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim().toUpperCase().startsWith('YES') ?? false;
}

/**
 * Probe every ATS API with every slug candidate, then VERIFY each hit before
 * accepting it. Verification matters because some ATS APIs (SmartRecruiters)
 * answer 200 for any slug, and slugs can be owned by unrelated companies.
 *
 * A hit is accepted only if it has at least one job AND:
 *  - the board's self-reported name matches the company, or
 *  - the API exposes no name, and OpenAI confirms the sample titles fit
 *    (without OpenAI: only exact full-name slugs are trusted).
 */
async function probeAtsProviders(
  companyName: string
): Promise<{ atsType: string; atsSlug: string; boardUrl: string } | null> {
  const candidates = slugCandidates(companyName);
  const fullNameSlug = candidates[0]; // words joined with no separator

  for (const slug of candidates) {
    const probes = atsAdapters.map(async (adapter) => {
      const result = await adapter.probe(slug);
      return result ? { adapter, slug, result } : null;
    });
    const hits = (await Promise.all(probes)).filter((h) => h !== null);

    for (const hit of hits) {
      const { adapter, result } = hit;
      const boardUrl = adapter.boardUrl(slug);

      if (result.jobCount < 1) {
        logger.info('Discovery: probe hit rejected (empty board)', { companyName, boardUrl });
        continue;
      }

      if (result.boardName) {
        if (boardNameMatches(companyName, result.boardName)) {
          return { atsType: adapter.type, atsSlug: slug, boardUrl };
        }
        logger.info('Discovery: probe hit rejected (name mismatch)', {
          companyName,
          boardUrl,
          boardName: result.boardName,
        });
        continue;
      }

      // No name in the API (Lever, Ashby): confirm with AI when possible.
      if (hasOpenAI()) {
        try {
          if (await confirmBoardWithAI(companyName, boardUrl, result.sampleTitles)) {
            return { atsType: adapter.type, atsSlug: slug, boardUrl };
          }
          logger.info('Discovery: probe hit rejected (AI said not a match)', {
            companyName,
            boardUrl,
          });
        } catch (err) {
          logger.warn('Discovery: AI board confirmation failed', {
            companyName,
            boardUrl,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }

      // Without OpenAI, only trust the exact full-name slug.
      if (slug === fullNameSlug) {
        return { atsType: adapter.type, atsSlug: slug, boardUrl };
      }
    }
  }
  return null;
}

/** Ask OpenAI (with web search) to find the company's careers/jobs page URL. */
async function searchCareersUrlWithOpenAI(companyName: string): Promise<string | null> {
  const openai = getOpenAI();

  const response = await openai.responses.create({
    model: env.openaiModel,
    tools: [{ type: 'web_search_preview' }],
    input: [
      {
        role: 'system',
        content:
          'You find the official careers/jobs listing page for companies. ' +
          'If multiple businesses share the name, assume the most well-known company. ' +
          'The URL must belong to that exact company — verify the domain or job-board slug ' +
          'actually refers to it, never a different business with a similar name. ' +
          'Prefer the page that lists open positions (often hosted on Greenhouse, Lever, Ashby, ' +
          'SmartRecruiters, or Workable, or a careers.* subdomain) over a marketing landing page. ' +
          'Respond with ONLY the URL on a single line, nothing else. ' +
          'If you cannot find one with reasonable confidence, respond with exactly NONE.',
      },
      {
        role: 'user',
        content: `Find the careers page with open job listings for the company "${companyName}".`,
      },
    ],
  });

  const text = response.output_text?.trim() ?? '';
  if (!text || text === 'NONE') return null;

  const match = text.match(/https?:\/\/\S+/);
  if (!match) return null;

  try {
    const url = new URL(match[0].replace(/[).,\]]+$/, ''));
    // Web search results sometimes carry tracking params; drop them.
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve a careers source from just a company name.
 * Order: ATS slug probing (free, exact) -> OpenAI web search -> null (manual needed).
 */
export async function discoverCareersSource(companyName: string): Promise<DiscoveryResult | null> {
  const probed = await probeAtsProviders(companyName);
  if (probed) {
    logger.info('Discovery: ATS probe hit', { companyName, ...probed });
    return {
      careersUrl: probed.boardUrl,
      atsType: probed.atsType,
      atsSlug: probed.atsSlug,
      method: 'ats_probe',
    };
  }

  if (hasOpenAI()) {
    try {
      const url = await searchCareersUrlWithOpenAI(companyName);
      if (url) {
        // The found URL might itself be a known ATS board — upgrade to the API
        // path, but only after verifying the board is real and non-empty.
        const detected = detectAtsFromUrl(url);
        let atsType: string | null = null;
        let atsSlug: string | null = null;
        if (detected) {
          const probe = await detected.adapter.probe(detected.slug);
          if (probe && probe.jobCount > 0) {
            atsType = detected.adapter.type;
            atsSlug = detected.slug;
          }
        }
        logger.info('Discovery: OpenAI search hit', { companyName, url, ats: atsType });
        return { careersUrl: url, atsType, atsSlug, method: 'openai_search' };
      }
    } catch (err) {
      logger.warn('Discovery: OpenAI search failed', {
        companyName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Discovery: no source found, manual URL needed', { companyName });
  return null;
}

/** When the user pastes a URL manually, still check if it maps to an ATS API. */
export function resolveManualUrl(url: string): DiscoveryResult {
  const detected = detectAtsFromUrl(url);
  return {
    careersUrl: url,
    atsType: detected?.adapter.type ?? null,
    atsSlug: detected?.slug ?? null,
    method: 'manual',
  };
}
