import type { CanonicalJob, CareerProfile, JobMatchResult, Language } from '../../types';

/**
 * The Career Fit scoring prompt, extracted so the web app and the Chrome
 * extension score jobs identically.
 *
 * This module deliberately has no imports beyond types: no React, no Supabase
 * client, no `import.meta.env`. Both runtimes can load it as-is, which is the
 * point — if the extension had its own copy of the prompt, the two would
 * drift and the same job would score differently depending on where the user
 * happened to be standing.
 */

const LANG_NAME: Record<Language, string> = {
  en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic',
};

export const MATCH_MODEL = 'gemini-flash-latest';

export function buildMatchSystemInstruction(targetLang: Language = 'en'): string {
  return `
    Role: Career Fit Analyst. You score how well a candidate's confirmed profile
    matches ONE specific job, and you must be able to justify every number.
    GROUNDING: Only use facts present in [CANDIDATE PROFILE]. Never invent
    experience, skills, or qualifications the candidate did not state.
    SCORING: Score each dimension 0-100 and assign it a weight (0-1) within
    the given range; the four weights you assign must sum to 1.0.
      - hardRequirements (weight 0.25-0.35): work rights, location, seniority,
        required degree/certifications. If a hard requirement is clearly
        unmet, this score MUST be low (<40) regardless of other fit.
      - skillsExperience (weight 0.25-0.35): overlap between the candidate's
        confirmed skills/experience and what the JD asks for.
      - goalsPreferences (weight 0.15-0.20): fit with the candidate's stated
        target titles, locations, salary range, and remote preference.
      - opportunityQuality (weight 0.10-0.15): how complete/specific/credible
        the JD itself is (a vague or very short JD scores low here).
    "hardGaps": short list of the specific unmet requirements, if any.
    "recommendedAction": one of priority_apply | apply | consider | skip.
    Output ONLY in ${LANG_NAME[targetLang] || 'English'}.
  `;
}

/**
 * Note what is NOT here: `profile.optionalDemographics` is never read. Age and
 * gender are protected attributes and must not influence a fit score — see the
 * comment on OptionalDemographics in types.ts.
 */
export function buildMatchPrompt(profile: CareerProfile, job: CanonicalJob): string {
  const confirmedWork = (profile.workHistory || []).filter((w) => w.confirmed);
  const confirmedEdu = (profile.education || []).filter((e) => e.confirmed);
  /* Unpaid work counts. The skills dimension is 30% of the score and used to
     read paid history alone, which scored a graduate whose evidence is a
     society they ran or two years of volunteering as though they had done
     nothing — and said so with a reason that was not true. */
  const confirmedVol = (profile.volunteer || []).filter((v) => v.confirmed);

  return `
    [CANDIDATE PROFILE]
    Target titles: ${profile.targetTitles.join(', ') || 'not specified'}
    Target locations: ${profile.targetLocations.join(', ') || 'not specified'}
    Target industries: ${profile.targetIndustries.join(', ') || 'not specified'}
    Seniority: ${profile.seniority || 'not specified'}
    Work rights: ${profile.workRights || 'not specified'}
    Salary expectation: ${profile.salaryMin ?? '?'}-${profile.salaryMax ?? '?'} ${profile.salaryCurrency ?? ''}
    Remote preference: ${profile.remotePreference || 'not specified'}
    Languages: ${(profile.languages || []).join(', ') || 'not specified'}
    Confirmed work history:
    ${confirmedWork.map((w) => `- ${w.role} at ${w.company} (${w.startDate || '?'} to ${w.current ? 'present' : w.endDate || '?'})${w.summary ? `: ${w.summary}` : ''}`).join('\n') || '(none confirmed yet)'}
    Confirmed education:
    ${confirmedEdu.map((e) => `- ${e.school}${e.degree ? `, ${e.degree}` : ''}${e.field ? ` in ${e.field}` : ''}${e.endDate ? ` (${e.endDate})` : ''}`).join('\n') || '(none confirmed yet)'}
    Confirmed volunteering and unpaid roles:
    ${confirmedVol.map((v) => `- ${v.role} at ${v.company} (${v.startDate || '?'} to ${v.current ? 'present' : v.endDate || '?'})${v.summary ? `: ${v.summary}` : ''}`).join('\n') || '(none confirmed yet)'}
    Certifications:
    ${(profile.certifications || []).join(', ') || '(none)'}
    Awards and honours:
    ${(profile.awards || []).join(', ') || '(none)'}
    Other confirmed facts:
    ${(profile.confirmedFacts || []).map((f) => `- [${f.category}] ${f.text}`).join('\n') || '(none)'}
    Derived skills:
    ${(profile.derivedSkills || []).map((s) => `- ${s.name} (${s.confidence} confidence, from: ${s.source})`).join('\n') || '(none)'}

    [JOB]
    Market: ${job.market}
    Title: ${job.title}
    Company: ${job.company}
    Location: ${job.location || 'not specified'}
    Employment type: ${job.employmentType || 'not specified'}
    Seniority: ${job.seniority || 'not specified'}
    Salary: ${job.salaryText || 'not specified'}
    Description:
    ${job.descriptionText}
  `;
}

const dim = {
  type: 'OBJECT',
  properties: { score: { type: 'NUMBER' }, weight: { type: 'NUMBER' }, notes: { type: 'STRING' } },
  required: ['score', 'weight', 'notes'],
};

export const MATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallScore: { type: 'NUMBER' },
    scoreBreakdown: {
      type: 'OBJECT',
      properties: {
        hardRequirements: dim,
        skillsExperience: dim,
        goalsPreferences: dim,
        opportunityQuality: dim,
      },
      required: ['hardRequirements', 'skillsExperience', 'goalsPreferences', 'opportunityQuality'],
    },
    hardGaps: { type: 'ARRAY', items: { type: 'STRING' } },
    recommendedAction: { type: 'STRING' },
  },
  required: ['overallScore', 'scoreBreakdown', 'hardGaps', 'recommendedAction'],
};

/**
 * Normalises whatever the model returned into a JobMatchResult.
 *
 * historicalOutcomes is pinned to 0/0 rather than asked of the model: there is
 * no outcome data yet, and the strategy doc is explicit that Outcome Learning
 * must not be implied before there is enough of it to mean anything.
 */
export function parseMatchResult(raw: unknown): JobMatchResult {
  const parsed = (raw ?? {}) as any;
  const validActions = ['priority_apply', 'apply', 'consider', 'skip'];
  return {
    overallScore: Number(parsed.overallScore) || 0,
    scoreBreakdown: {
      hardRequirements: parsed.scoreBreakdown?.hardRequirements ?? { score: 0, weight: 0.3, notes: '' },
      skillsExperience: parsed.scoreBreakdown?.skillsExperience ?? { score: 0, weight: 0.3, notes: '' },
      goalsPreferences: parsed.scoreBreakdown?.goalsPreferences ?? { score: 0, weight: 0.175, notes: '' },
      opportunityQuality: parsed.scoreBreakdown?.opportunityQuality ?? { score: 0, weight: 0.125, notes: '' },
      historicalOutcomes: { score: 0, weight: 0, notes: 'No outcome history yet.' },
    },
    hardGaps: Array.isArray(parsed.hardGaps) ? parsed.hardGaps : [],
    recommendedAction: validActions.includes(parsed.recommendedAction) ? parsed.recommendedAction : 'consider',
    modelVersion: MATCH_MODEL,
  };
}
