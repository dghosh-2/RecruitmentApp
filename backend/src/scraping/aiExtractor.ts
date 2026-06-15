import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createRenderSession } from './browser.js';
import { getOpenAI } from './openaiClient.js';
import type { EmploymentType, RawListing } from './types.js';

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    listings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Exact job title as shown on the page' },
          url: {
            type: ['string', 'null'],
            description: 'Absolute URL to the job detail/apply page, or null if not present',
          },
          location: { type: ['string', 'null'] },
          employment_type: {
            type: 'string',
            enum: ['internship', 'full_time', 'part_time', 'contract', 'unknown'],
          },
          team: { type: ['string', 'null'], description: 'Department or team if shown' },
        },
        required: ['title', 'url', 'location', 'employment_type', 'team'],
      },
    },
    next_page_url: {
      type: ['string', 'null'],
      description:
        'Absolute URL of the NEXT page of job listings if the board is paginated ' +
        '(e.g. ?page=2, "Next" link, "Load more" href). Null if there is no next page.',
    },
  },
  required: ['listings', 'next_page_url'],
} as const;

interface ExtractionResponse {
  listings: {
    title: string;
    url: string | null;
    location: string | null;
    employment_type: EmploymentType;
    team: string | null;
  }[];
  next_page_url: string | null;
}

const SYSTEM_PROMPT = `You are a precise job-listing extraction engine. You receive the visible text of a company careers page plus a list of hyperlinks found on it.

Rules:
- Extract ONLY real, individual job openings visible on this page. Never invent or guess listings.
- Do NOT extract navigation items, department headers, benefit blurbs, blog posts, or generic "View openings" links.
- Match each listing to its most specific link from the provided link list to produce an absolute URL. Use null if no link clearly belongs to it.
- employment_type: "internship" for internships/co-ops (any title containing Intern), "full_time" for permanent roles, "part_time"/"contract" where stated, otherwise "unknown".
- next_page_url: if the link list or text shows pagination (page numbers, "Next", "Load more" with an href, ?page=N / ?offset=N patterns), return the absolute URL of the page AFTER the current one. Return null when there is no further page.
- If the page contains no job listings at all, return an empty listings array.`;

async function extractFromPage(
  pageText: string,
  links: { text: string; href: string }[],
  pageUrl: string
): Promise<ExtractionResponse> {
  const openai = getOpenAI();

  const linkList = links.map((l) => `- "${l.text}" -> ${l.href}`).join('\n');

  const completion = await openai.chat.completions.create({
    model: env.openaiModel,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'job_extraction', strict: true, schema: EXTRACTION_SCHEMA },
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Current page URL: ${pageUrl}\n\n=== PAGE TEXT ===\n${pageText}\n\n=== LINKS ON PAGE ===\n${linkList}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty extraction response');
  return JSON.parse(content) as ExtractionResponse;
}

function toAbsolute(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

export interface AiExtractionResult {
  listings: RawListing[];
  pagesCrawled: number;
  /** True when we stopped at SCRAPE_MAX_PAGES while another page still existed. */
  truncated: boolean;
}

/**
 * Generic careers-page extraction: render with Playwright, extract with OpenAI
 * structured outputs, and follow AI-identified pagination up to SCRAPE_MAX_PAGES.
 */
export async function extractListingsWithAI(startUrl: string): Promise<AiExtractionResult> {
  const visited = new Set<string>();
  const seenFingerprints = new Set<string>();
  const all: RawListing[] = [];

  let currentUrl: string | null = startUrl;
  let pagesCrawled = 0;

  // One browser context for the whole pagination loop: resource blocking is
  // installed once and per-page context setup is avoided on large boards.
  const session = await createRenderSession();
  try {
    while (currentUrl && pagesCrawled < env.scrapeMaxPages) {
      if (visited.has(currentUrl)) break;
      visited.add(currentUrl);

      logger.info('AI extraction: rendering page', { url: currentUrl, page: pagesCrawled + 1 });
      const rendered = await session.render(currentUrl);
      visited.add(rendered.finalUrl);
      pagesCrawled += 1;

      const extraction = await extractFromPage(rendered.text, rendered.links, rendered.finalUrl);

      let newOnThisPage = 0;
      for (const item of extraction.listings) {
        const url = toAbsolute(item.url, rendered.finalUrl);
        const key = `${item.title.toLowerCase()}|${(url ?? item.location ?? '').toLowerCase()}`;
        if (seenFingerprints.has(key)) continue;
        seenFingerprints.add(key);
        newOnThisPage += 1;
        all.push({
          title: item.title,
          url,
          location: item.location,
          employmentType: item.employment_type,
          team: item.team,
        });
      }

      logger.info('AI extraction: page parsed', {
        url: rendered.finalUrl,
        found: extraction.listings.length,
        new: newOnThisPage,
        nextPage: extraction.next_page_url,
      });

      // A next page that yields nothing new means we're looping — stop.
      if (newOnThisPage === 0 && pagesCrawled > 1) {
        currentUrl = null;
        break;
      }

      currentUrl = toAbsolute(extraction.next_page_url, rendered.finalUrl);
    }
  } finally {
    await session.close();
  }

  const truncated = currentUrl !== null && !visited.has(currentUrl);
  if (truncated) {
    logger.warn('AI extraction: stopped at page cap with pages remaining', {
      nextPage: currentUrl,
      cap: env.scrapeMaxPages,
    });
  }

  return { listings: all, pagesCrawled, truncated };
}
