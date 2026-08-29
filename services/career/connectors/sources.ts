import type { JobMarket } from '../../../types';

/**
 * The set of valid `jobs.source` values. This is intentionally an
 * application-layer list, not a database CHECK constraint — new sources
 * (a SEEK connector, a China platform connector) should ship as a new
 * connector + an addition to this list, never a migration.
 */
export const KNOWN_JOB_SOURCES = [
  'manual',
  'company_site',
  'seek',
  'seek_grad',
  'linkedin',
  'indeed',
  'boss_zhipin',
  'liepin',
  'zhilian',
  'job51',
  'campus_site',
] as const;

export type KnownJobSource = (typeof KNOWN_JOB_SOURCES)[number];

export const JOB_SOURCES_BY_MARKET: Record<JobMarket, KnownJobSource[]> = {
  AU: ['manual', 'company_site', 'seek', 'seek_grad', 'linkedin', 'indeed'],
  CN: ['manual', 'company_site', 'boss_zhipin', 'liepin', 'zhilian', 'job51', 'campus_site'],
};

/**
 * Validates a source string before it's written. Unknown sources are still
 * allowed through (so a connector added in code but not yet listed here
 * doesn't hard-fail), but callers should prefer `KNOWN_JOB_SOURCES` and log
 * anything that falls through this check.
 */
export function isKnownJobSource(source: string): source is KnownJobSource {
  return (KNOWN_JOB_SOURCES as readonly string[]).includes(source);
}
