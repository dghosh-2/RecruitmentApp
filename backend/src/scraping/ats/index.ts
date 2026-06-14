import type { AtsAdapter } from '../types.js';
import { greenhouse } from './greenhouse.js';
import { lever } from './lever.js';
import { ashby } from './ashby.js';
import { smartrecruiters } from './smartrecruiters.js';
import { workable } from './workable.js';

export const atsAdapters: AtsAdapter[] = [greenhouse, lever, ashby, smartrecruiters, workable];

export function getAdapter(type: string): AtsAdapter | undefined {
  return atsAdapters.find((adapter) => adapter.type === type);
}

/** Match a careers URL against every known ATS pattern. */
export function detectAtsFromUrl(url: string): { adapter: AtsAdapter; slug: string } | null {
  for (const adapter of atsAdapters) {
    const slug = adapter.detectSlugFromUrl(url);
    if (slug) return { adapter, slug };
  }
  return null;
}
