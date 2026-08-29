import type { CanonicalJobInput } from '../../../types';
import type { JobSourceConnector } from './types';

/** What the "paste a JD" form collects. */
export interface ManualJobEntry {
  market: CanonicalJobInput['market'];
  title: string;
  company: string;
  descriptionText: string;
  location?: string;
  sourceUrl?: string;
  salaryText?: string;
  employmentType?: string;
  seniority?: string;
}

/**
 * The only connector Phase 1 actually uses: the user pastes a JD into
 * JobsBoard themselves. `normalize` here is close to a no-op because there's
 * no platform-specific HTML/API response to parse — that asymmetry with a
 * real connector (which would scrape/parse a page or call an API) is
 * expected and fine.
 */
export const manualConnector: JobSourceConnector = {
  source: 'manual',
  normalize(raw: unknown): CanonicalJobInput {
    const entry = raw as ManualJobEntry;
    if (!entry?.title || !entry?.company || !entry?.descriptionText || !entry?.market) {
      throw new Error('Manual job entry requires market, title, company, and descriptionText');
    }
    return {
      source: 'manual',
      market: entry.market,
      title: entry.title,
      company: entry.company,
      descriptionText: entry.descriptionText,
      location: entry.location,
      sourceUrl: entry.sourceUrl,
      salaryText: entry.salaryText,
      employmentType: entry.employmentType,
      seniority: entry.seniority,
    };
  },
};
