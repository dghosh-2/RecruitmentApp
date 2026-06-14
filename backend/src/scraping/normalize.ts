import { fingerprintListing } from '../services/listingService.js';
import { looksLikeInternship } from './internship.js';
import type { EmploymentType, NormalizedListing, RawListing } from './types.js';

function classifyEmploymentType(raw: RawListing): EmploymentType {
  // A title that clearly reads as an internship overrides a generic upstream
  // label: ATS feeds often tag "Summer Analyst" roles as full_time/unknown.
  if (looksLikeInternship(raw.title)) return 'internship';
  if (raw.employmentType && raw.employmentType !== 'unknown') return raw.employmentType;
  const title = raw.title;
  if (/part[- ]?time/i.test(title)) return 'part_time';
  if (/\bcontract(or)?\b|\btemporary\b/i.test(title)) return 'contract';
  return raw.employmentType ?? 'unknown';
}

export function normalizeListings(raw: RawListing[], baseUrl: string): NormalizedListing[] {
  const out: NormalizedListing[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const title = item.title.replace(/\s+/g, ' ').trim();
    if (title.length < 2 || title.length > 250) continue;

    let url: string | null = null;
    if (item.url) {
      try {
        url = new URL(item.url, baseUrl).toString();
      } catch {
        url = null;
      }
    }

    const location = item.location?.replace(/\s+/g, ' ').trim() || null;
    const team = item.team?.replace(/\s+/g, ' ').trim() || null;
    const fingerprint = fingerprintListing(title, url, location);

    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    out.push({
      title,
      url,
      location,
      team,
      employmentType: classifyEmploymentType({ ...item, title }),
      fingerprint,
    });
  }

  return out;
}
