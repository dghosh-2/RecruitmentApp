import type { AtsAdapter, EmploymentType, RawListing } from '../types.js';
import { classifyTitle, fetchJson } from './http.js';

interface WorkableJob {
  title: string;
  shortcode?: string;
  url?: string;
  city?: string;
  state?: string;
  country?: string;
  remote?: boolean;
  employment_type?: string;
  department?: string;
}

interface WorkableResponse {
  name?: string;
  jobs: WorkableJob[];
}

function workableType(value?: string, title?: string): EmploymentType | null {
  if (!value) return classifyTitle(title ?? '');
  if (/intern/i.test(value)) return 'internship';
  if (/part/i.test(value)) return 'part_time';
  if (/contract|temporary/i.test(value)) return 'contract';
  if (/full/i.test(value)) return classifyTitle(title ?? '') ?? 'full_time';
  return classifyTitle(title ?? '');
}

function formatLocation(job: WorkableJob): string | null {
  const parts = [job.city, job.state, job.country].filter(Boolean);
  const base = parts.join(', ');
  if (job.remote) return base ? `${base} (Remote)` : 'Remote';
  return base || null;
}

export const workable: AtsAdapter = {
  type: 'workable',
  label: 'Workable',

  detectSlugFromUrl(url) {
    const apply = url.match(/apply\.workable\.com\/([a-z0-9_-]+)/i);
    if (apply) return apply[1].toLowerCase();
    const subdomain = url.match(/https?:\/\/([a-z0-9_-]+)\.workable\.com/i);
    if (subdomain && !['apply', 'www', 'jobs', 'careers'].includes(subdomain[1].toLowerCase())) {
      return subdomain[1].toLowerCase();
    }
    return null;
  },

  boardUrl(slug) {
    return `https://apply.workable.com/${slug}`;
  },

  async probe(slug) {
    const data = await fetchJson<WorkableResponse>(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`
    );
    if (!data || !Array.isArray(data.jobs)) return null;
    return {
      boardName: data.name ?? null,
      jobCount: data.jobs.length,
      sampleTitles: data.jobs.slice(0, 5).map((j) => j.title),
    };
  },

  async fetchListings(slug) {
    const data = await fetchJson<WorkableResponse>(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
      15000
    );
    if (!data?.jobs) throw new Error(`Workable board "${slug}" returned no data`);

    return data.jobs.map<RawListing>((job) => ({
      title: job.title,
      url:
        job.url ??
        (job.shortcode ? `https://apply.workable.com/${slug}/j/${job.shortcode}/` : null),
      location: formatLocation(job),
      team: job.department ?? null,
      employmentType: workableType(job.employment_type, job.title),
    }));
  },
};
