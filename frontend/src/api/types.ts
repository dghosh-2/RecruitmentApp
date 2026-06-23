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

// --- company discovery (NL multi-agent search) ---
export type SearchStatus = 'pending' | 'running' | 'success' | 'failed';
export type SearchMode = 'fast' | 'thorough';
// 'discover' = company suggestions only; 'auto' = the all-in-one Assistant run.
export type SearchKind = 'discover' | 'auto';
export type AutoPhase = 'planning' | 'researching' | 'scraping' | 'done';

export interface ResearchTask {
  angle: 'direct_match' | 'adjacent' | 'constraint' | 'dynamic';
  focus: string;
  instructions: string;
}

export interface SearchPlan {
  intentSummary: string;
  constraints: string[];
  exclusions: string[];
  tasks: ResearchTask[];
}

export interface SearchResultCompany {
  name: string;
  website: string | null;
  reason: string;
}

export interface AutoJobListing {
  title: string;
  url: string | null;
  location: string | null;
}

export interface AutoCompanyResult {
  companyId: number;
  companyName: string;
  careersUrl: string | null;
  discoveryStatus: 'pending' | 'searching' | 'found' | 'manual_needed';
  scrapeStatus: 'running' | 'success' | 'failed' | null;
  error: string | null;
  listings: AutoJobListing[];
}

export interface CompanySearch {
  id: number;
  query: string;
  mode: SearchMode;
  kind: SearchKind;
  phase: AutoPhase | null;
  status: SearchStatus;
  error: string | null;
  plan: SearchPlan | null;
  results: SearchResultCompany[];
  jobs: AutoCompanyResult[];
  createdAt: string;
  finishedAt: string | null;
}
