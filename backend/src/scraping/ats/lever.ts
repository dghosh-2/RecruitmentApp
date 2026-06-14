import type { AtsAdapter, EmploymentType, RawListing } from '../types.js';
import { looksLikeInternship } from '../internship.js';
import { classifyTitle, fetchJson } from './http.js';

interface LeverPosting {
  text: string;
  hostedUrl: string;
  categories?: {
    location?: string;
    team?: string;
    commitment?: string;
  };
}

function commitmentToType(commitment?: string, title?: string): EmploymentType | null {
  const value = `${commitment ?? ''} ${title ?? ''}`;
  if (looksLikeInternship(value)) return 'internship';
  if (/part[- ]?time/i.test(value)) return 'part_time';
  if (/contract/i.test(value)) return 'contract';
  if (/full[- ]?time/i.test(value)) return 'full_time';
  return null;
}

export const lever: AtsAdapter = {
  type: 'lever',
  label: 'Lever',

  detectSlugFromUrl(url) {
    const match = url.match(/jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/i);
    return match ? match[1].toLowerCase() : null;
  },

  boardUrl(slug) {
    return `https://jobs.lever.co/${slug}`;
  },

  async probe(slug) {
    // Lever's postings API exposes no company name; verification relies on
    // sample titles (AI-confirmed in discovery).
    const data = await fetchJson<LeverPosting[]>(
      `https://api.lever.co/v0/postings/${slug}?mode=json&limit=5`
    );
    if (!Array.isArray(data)) return null;
    return {
      boardName: null,
      jobCount: data.length,
      sampleTitles: data.slice(0, 5).map((p) => p.text),
    };
  },

  async fetchListings(slug) {
    const pageSize = 100;
    const all: RawListing[] = [];

    for (let skip = 0; skip < 2000; skip += pageSize) {
      const page = await fetchJson<LeverPosting[]>(
        `https://api.lever.co/v0/postings/${slug}?mode=json&limit=${pageSize}&skip=${skip}`,
        15000
      );
      if (page === null) {
        if (skip === 0) throw new Error(`Lever board "${slug}" returned no data`);
        break;
      }

      all.push(
        ...page.map<RawListing>((posting) => ({
          title: posting.text,
          url: posting.hostedUrl,
          location: posting.categories?.location ?? null,
          team: posting.categories?.team ?? null,
          employmentType:
            commitmentToType(posting.categories?.commitment, posting.text) ??
            classifyTitle(posting.text),
        }))
      );

      if (page.length < pageSize) break;
    }

    return all;
  },
};
