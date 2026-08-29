/**
 * Single source of truth for what every action costs.
 *
 * The pricing page and the code that actually spends credits both read from
 * here, so the two can no longer drift apart (they previously disagreed:
 * the page advertised 1 credit for a resume, the code charged 2).
 */
export const CREDIT_COSTS = {
  /** Resume rewrite + cover letter, generated in one call. */
  resumeOptimization: 2,
  /** One portfolio project analysed from an uploaded file. */
  portfolioProject: 5,
  /** Career path prediction. */
  careerAnalysis: 2,
  /** Follow-up career strategy for a chosen path. */
  careerStrategy: 1,
  /** Explainable Career Fit / Match Score for one job. */
  jobMatchScore: 1,
  /** Extracting a Career Profile from an uploaded resume. */
  profileImport: 1,
  /**
   * PDF export of the career report.
   *
   * The resume/cover-letter export is deliberately NOT charged: it goes through
   * the browser's print dialog (so the PDF contains real text an ATS can read),
   * and there is no reliable signal that the user actually saved the file.
   */
  pdfExport: 1,
} as const;

/** Mock interview cost scales with session length (minutes -> credits). */
export const interviewCost = (durationMinutes: number): number =>
  durationMinutes <= 5 ? 3 : durationMinutes <= 10 ? 6 : 10;

/**
 * Free tier: the balance is topped back up to this every UTC day.
 *
 * Must be >= the most expensive thing a free user is invited to try, otherwise
 * that feature is permanently unreachable and can never convert anyone.
 */
export const DAILY_FREE_CREDITS = 5;
