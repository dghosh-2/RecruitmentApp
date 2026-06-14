import type { AtsAdapter, EmploymentType, RawListing } from '../types.js';
import { classifyTitle, fetchJson } from './http.js';

interface SmartRecruitersPosting {
  id: string;
  name: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  typeOfEmployment?: { label?: string };
  department?: { label?: string };
  company?: { identifier?: string };
}

interface SmartRecruitersResponse {
  totalFound: number;
  content: SmartRecruitersPosting[];
}

function formatLocation(loc?: SmartRecruitersPosting['location']): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean);
  const base = parts.join(', ');
  if (loc.remote) return base ? `${base} (Remote)` : 'Remote';
  return base || null;
}

function srType(label?: string, title?: string): EmploymentType | null {
  const value = `${label ?? ''}`;
  if (/intern/i.test(value)) return 'internship';
  if (/part[- ]?time/i.test(value)) return 'part_time';
  if (/contract|temporary/i.test(value)) return 'contract';
  if (/full[- ]?time|permanent/i.test(value)) return classifyTitle(title ?? '') ?? 'full_time';
  return classifyTitle(title ?? '');
}

export const smartrecruiters: AtsAdapter = {
  type: 'smartrecruiters',
  label: 'SmartRecruiters',

  detectSlugFromUrl(url) {
    const match = url.match(/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  },

  boardUrl(slug) {
    return `https://jobs.smartrecruiters.com/${slug}`;
  },

  async probe(slug) {
    // CRITICAL: the postings endpoint returns 200 with totalFound=0 for ANY
    // slug, even nonexistent companies. The companies endpoint 404s properly,
    // so use it to confirm existence and get the real company name.
    const [details, postings] = await Promise.all([
      fetchJson<{ name?: string }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}`
      ),
      fetchJson<SmartRecruitersResponse>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=5`
      ),
    ]);
    if (!details?.name || !postings || !Array.isArray(postings.content)) return null;
    return {
      boardName: details.name,
      jobCount: postings.totalFound,
      sampleTitles: postings.content.slice(0, 5).map((p) => p.name),
    };
  },

  async fetchListings(slug) {
    const pageSize = 100;
    const all: RawListing[] = [];
    let offset = 0;

    while (offset < 2000) {
      const data = await fetchJson<SmartRecruitersResponse>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${pageSize}&offset=${offset}`,
        15000
      );
      if (!data?.content) {
        if (offset === 0) throw new Error(`SmartRecruiters board "${slug}" returned no data`);
        break;
      }

      all.push(
        ...data.content.map<RawListing>((posting) => ({
          title: posting.name,
          url: `https://jobs.smartrecruiters.com/${posting.company?.identifier ?? slug}/${posting.id}`,
          location: formatLocation(posting.location),
          team: posting.department?.label ?? null,
          employmentType: srType(posting.typeOfEmployment?.label, posting.name),
        }))
      );

      offset += pageSize;
      if (offset >= data.totalFound) break;
    }

    return all;
  },
};
