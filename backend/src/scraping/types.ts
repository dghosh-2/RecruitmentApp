export type EmploymentType = 'internship' | 'full_time' | 'part_time' | 'contract' | 'unknown';

/** A listing as produced by an ATS adapter or the AI extractor, before normalization. */
export interface RawListing {
  title: string;
  url: string | null;
  location: string | null;
  employmentType?: EmploymentType | null;
  team?: string | null;
}

/** A listing ready for upsert: cleaned, classified, fingerprinted. */
export interface NormalizedListing {
  title: string;
  url: string | null;
  location: string | null;
  employmentType: EmploymentType;
  team: string | null;
  fingerprint: string;
}

/**
 * Evidence gathered when probing a slug, used to verify the board actually
 * belongs to the company (some ATS APIs return 200 for ANY slug, e.g.
 * SmartRecruiters returns an empty board instead of a 404).
 */
export interface ProbeResult {
  /** The board's self-reported company name, when the API exposes one. */
  boardName: string | null;
  jobCount: number;
  sampleTitles: string[];
}

/**
 * Adapter for an Applicant Tracking System with a public JSON API.
 * Adapters bypass HTML entirely — this is the most reliable path.
 */
export interface AtsAdapter {
  /** Stable identifier stored in companies.ats_type, e.g. "greenhouse". */
  type: string;
  label: string;
  /** Extract the company's board slug from a careers URL, or null if not this ATS. */
  detectSlugFromUrl(url: string): string | null;
  /** Existence check + evidence for verification. Null when the board doesn't exist. */
  probe(slug: string): Promise<ProbeResult | null>;
  /** Fetch ALL listings, following the API's own pagination where applicable. */
  fetchListings(slug: string): Promise<RawListing[]>;
  /** Human-visitable job board URL for this slug. */
  boardUrl(slug: string): string;
}

export interface ScrapeResult {
  status: 'success' | 'failed';
  method: string;
  pagesCrawled: number;
  listingsFound: number;
  listingsNew: number;
  error?: string;
}
