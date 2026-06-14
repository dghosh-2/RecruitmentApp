import type { AtsAdapter, RawListing } from '../types.js';
import { classifyTitle, fetchJson } from './http.js';

interface GreenhouseJob {
  title: string;
  absolute_url: string;
  location?: { name?: string };
  departments?: { name: string }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export const greenhouse: AtsAdapter = {
  type: 'greenhouse',
  label: 'Greenhouse',

  detectSlugFromUrl(url) {
    const match = url.match(
      /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?(?:.*&)?for=)?([a-z0-9_-]+)/i
    );
    return match ? match[1].toLowerCase() : null;
  },

  boardUrl(slug) {
    return `https://boards.greenhouse.io/${slug}`;
  },

  async probe(slug) {
    const [data, board] = await Promise.all([
      fetchJson<GreenhouseResponse>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`),
      fetchJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${slug}`),
    ]);
    if (!data || !Array.isArray(data.jobs)) return null;
    return {
      boardName: board?.name ?? null,
      jobCount: data.jobs.length,
      sampleTitles: data.jobs.slice(0, 5).map((j) => j.title),
    };
  },

  async fetchListings(slug) {
    const data = await fetchJson<GreenhouseResponse>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
      15000
    );
    if (!data?.jobs) throw new Error(`Greenhouse board "${slug}" returned no data`);

    return data.jobs.map<RawListing>((job) => ({
      title: job.title,
      url: job.absolute_url,
      location: job.location?.name ?? null,
      team: job.departments?.[0]?.name ?? null,
      employmentType: classifyTitle(job.title),
    }));
  },
};
