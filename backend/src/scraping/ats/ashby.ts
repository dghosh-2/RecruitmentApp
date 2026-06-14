import type { AtsAdapter, EmploymentType, RawListing } from '../types.js';
import { classifyTitle, fetchJson } from './http.js';

interface AshbyJob {
  title: string;
  jobUrl?: string;
  applyUrl?: string;
  location?: string;
  department?: string;
  team?: string;
  employmentType?: string;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

function ashbyType(value?: string, title?: string): EmploymentType | null {
  switch (value) {
    case 'Intern':
      return 'internship';
    case 'FullTime':
      // An "Intern" title with FullTime hours is still an internship to users.
      return classifyTitle(title ?? '') ?? 'full_time';
    case 'PartTime':
      return 'part_time';
    case 'Contract':
    case 'Temporary':
      return 'contract';
    default:
      return classifyTitle(title ?? '');
  }
}

export const ashby: AtsAdapter = {
  type: 'ashby',
  label: 'Ashby',

  detectSlugFromUrl(url) {
    const match = url.match(/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i);
    return match ? match[1] : null;
  },

  boardUrl(slug) {
    return `https://jobs.ashbyhq.com/${slug}`;
  },

  async probe(slug) {
    // Ashby's posting API exposes no company name; verification relies on
    // sample titles (AI-confirmed in discovery).
    const data = await fetchJson<AshbyResponse>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`
    );
    if (!data || !Array.isArray(data.jobs)) return null;
    return {
      boardName: null,
      jobCount: data.jobs.length,
      sampleTitles: data.jobs.slice(0, 5).map((j) => j.title),
    };
  },

  async fetchListings(slug) {
    const data = await fetchJson<AshbyResponse>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
      15000
    );
    if (!data?.jobs) throw new Error(`Ashby board "${slug}" returned no data`);

    return data.jobs.map<RawListing>((job) => ({
      title: job.title,
      url: job.jobUrl ?? job.applyUrl ?? null,
      location: job.location ?? null,
      team: job.team ?? job.department ?? null,
      employmentType: ashbyType(job.employmentType, job.title),
    }));
  },
};
