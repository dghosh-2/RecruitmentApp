export type Preference = 'internship' | 'full_time' | 'both';
export type EmploymentType = 'internship' | 'full_time' | 'part_time' | 'contract' | 'unknown';
export type ListingStatus = 'new' | 'seen' | 'deleted';
export type ScrapeMode = 'all' | 'internship';

export interface User {
  id: number;
  email: string;
  preference: Preference;
  notifyEmail: boolean;
  createdAt: string;
}

export interface Industry {
  id: number;
  name: string;
  createdAt: string;
}

export interface Company {
  id: number;
  industryId: number;
  name: string;
  careersUrl: string | null;
  internCareersUrl: string | null;
  atsType: string | null;
  atsSlug: string | null;
  discoveryStatus: 'pending' | 'searching' | 'found' | 'manual_needed';
  discoveryMethod: string | null;
  lastScrapeStatus: 'running' | 'success' | 'failed' | null;
  lastScrapedAt: string | null;
  lastScrapeError: string | null;
  createdAt: string;
  newListingCount: number;
  listingCount: number;
}

export interface Listing {
  id: number;
  companyId: number;
  companyName: string;
  title: string;
  url: string | null;
  location: string | null;
  employmentType: EmploymentType;
  team: string | null;
  status: ListingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ScrapeRun {
  id: number;
  status: 'running' | 'success' | 'failed';
  method: string | null;
  pagesCrawled: number;
  listingsFound: number;
  listingsNew: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ScrapeResult {
  status: 'success' | 'failed';
  method: string;
  pagesCrawled: number;
  listingsFound: number;
  listingsNew: number;
  error?: string;
}
