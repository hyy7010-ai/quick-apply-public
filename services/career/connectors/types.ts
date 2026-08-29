import type { CanonicalJobInput } from '../../../types';

/**
 * A job source connector turns whatever a platform gives you into a
 * CanonicalJobInput (which already carries `market` — a source like SEEK is
 * always AU, BOSS直聘 always CN, and a connector is free to hardcode that when
 * it builds the result). Phase 1 ships exactly one implementation
 * (ManualConnector, see manualConnector.ts) — everything else here exists so
 * that adding a real SEEK/LinkedIn/BOSS直聘/etc. connector later is "write a
 * file that implements this interface," not "redesign the Jobs data model."
 *
 * `search` is deliberately NOT part of this interface yet: Phase 1 does no
 * proactive job discovery, only user-supplied capture. A search capability
 * belongs to a later phase and should be added to this interface then, not
 * stubbed out now.
 */
export interface JobSourceConnector {
  readonly source: string;
  /** Turn whatever raw input this connector accepts into a CanonicalJobInput
   * ready for jobsService.createJob. */
  normalize(raw: unknown): CanonicalJobInput;
}
