import { api } from './client';
import type {
  Company,
  Industry,
  Listing,
  Preference,
  ScrapeMode,
  ScrapeResult,
  ScrapeRun,
  User,
} from './types';

// --- auth ---
export const authApi = {
  register: (email: string, password: string, preference: Preference) =>
    api<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: { email, password, preference },
    }),
  login: (email: string, password: string) =>
    api<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => api<{ user: User }>('/auth/me'),
  update: (updates: { preference?: Preference; notifyEmail?: boolean }) =>
    api<{ user: User }>('/auth/me', { method: 'PATCH', body: updates }),
};

// --- industries ---
export const industryApi = {
  list: () => api<{ industries: Industry[] }>('/industries'),
  create: (name: string) =>
    api<{ industry: Industry }>('/industries', { method: 'POST', body: { name } }),
  rename: (id: number, name: string) =>
    api<{ industry: Industry }>(`/industries/${id}`, { method: 'PATCH', body: { name } }),
  remove: (id: number) => api<void>(`/industries/${id}`, { method: 'DELETE' }),
};

// --- companies ---
export const companyApi = {
  list: () => api<{ companies: Company[] }>('/companies'),
  get: (id: number) => api<{ company: Company; scrapeRuns: ScrapeRun[] }>(`/companies/${id}`),
  create: (name: string, industryId: number, careersUrl?: string) =>
    api<{ company: Company }>('/companies', {
      method: 'POST',
      body: { name, industryId, ...(careersUrl ? { careersUrl } : {}) },
    }),
  update: (
    id: number,
    updates: { name?: string; careersUrl?: string | null; internCareersUrl?: string | null }
  ) => api<{ company: Company }>(`/companies/${id}`, { method: 'PATCH', body: updates }),
  remove: (id: number) => api<void>(`/companies/${id}`, { method: 'DELETE' }),
  // Fire-and-forget: the backend queues the scrape; poll company status.
  // mode 'internship' scrapes only intern/early-career roles.
  scrape: (id: number, mode: ScrapeMode = 'all') =>
    api<{ company: Company }>(`/companies/${id}/scrape`, { method: 'POST', body: { mode } }),
  rediscover: (id: number) =>
    api<{ company: Company }>(`/companies/${id}/rediscover`, { method: 'POST' }),
  scrapeAll: (mode: ScrapeMode = 'all') =>
    api<{ queued: number }>('/companies/scrape-all', { method: 'POST', body: { mode } }),
};

// --- listings ---
export const listingApi = {
  list: (params: {
    companyId?: number;
    status?: 'new' | 'seen' | 'deleted' | 'active';
    applyPreference?: boolean;
    employmentType?: 'internship' | 'full_time' | 'part_time' | 'contract' | 'unknown';
  }) => {
    const query = new URLSearchParams();
    if (params.companyId !== undefined) query.set('companyId', String(params.companyId));
    if (params.status) query.set('status', params.status);
    if (params.applyPreference === false) query.set('applyPreference', 'false');
    if (params.employmentType) query.set('employmentType', params.employmentType);
    return api<{ listings: Listing[] }>(`/listings?${query.toString()}`);
  },
  remove: (id: number) => api<void>(`/listings/${id}`, { method: 'DELETE' }),
  markSeen: (companyId?: number) =>
    api<{ updated: number }>('/listings/mark-seen', {
      method: 'POST',
      body: companyId !== undefined ? { companyId } : {},
    }),
};
