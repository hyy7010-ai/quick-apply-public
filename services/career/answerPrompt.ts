import type { CanonicalJob, CareerProfile, Language } from '../../types';

/**
 * Drafting answers to the open questions an application form asks.
 *
 * These are the fields that actually cost an applicant their evening: "why do
 * you want this role", "describe a time you handled a difficult stakeholder".
 * Deterministic fields are filled from the profile and high-stakes ones are
 * left to the user; this is the third case, where the honest thing is a draft
 * the user reads and edits rather than either a blank box or an answer written
 * in their name behind their back.
 *
 * The hard rule is the same one the resume generator follows: every claim must
 * come from the profile. A form answer is a statement made to an employer by
 * the applicant, so an invented project here is not a hallucination to be
 * shrugged at, it is a lie with the user's name on it. When the profile does
 * not support an answer the model must say so instead of filling the gap.
 *
 * Shared with the extension, so it depends on nothing: the service that would
 * normally hold this builds a browser Supabase client and imports
 * @google/genai, neither of which survives in an MV3 service worker.
 */

const langNames: Record<Language, string> = {
  en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic',
};

export function buildAnswerSystemInstruction(targetLang: Language = 'en'): string {
  return `
    Role: You draft answers to job application questions, in the applicant's
    own voice, for the applicant to review before sending.

    GROUNDING — the only rule that matters:
    Every concrete claim must trace to the CANDIDATE PROFILE below. Do not
    invent employers, projects, numbers, dates, tools or outcomes. Do not
    upgrade a "familiar with" into "expert in". If the profile does not
    contain what a question asks about, set "grounded" to false and write the
    honest partial answer the profile does support — never a plausible
    fabrication. A wrong claim here is a false statement to an employer with
    the applicant's name on it.

    STYLE:
    Answer in the first person, plainly, as the applicant would. No greeting,
    no sign-off, no restating the question. Prefer one specific fact from the
    profile over three adjectives. Match the length the field expects: two to
    four sentences unless the question clearly wants more.
    Never claim enthusiasm as evidence. "I am passionate about X" says nothing;
    "I spent six months building X" says something.

    Write the answers in ${langNames[targetLang]}, unless the question is
    written in another language, in which case answer in the question's
    language — the employer reads it, not the applicant.
  `;
}

export const ANSWER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'The id of the question being answered' },
          answer: { type: 'STRING' },
          grounded: {
            type: 'BOOLEAN',
            description: 'False when the profile does not fully support the answer',
          },
          gap: {
            type: 'STRING',
            description: 'When grounded is false, what the profile is missing. Omit otherwise.',
          },
        },
        required: ['id', 'answer', 'grounded'],
      },
    },
  },
  required: ['answers'],
};

export interface DraftedAnswer {
  id: string;
  answer: string;
  grounded: boolean;
  gap?: string;
}

export interface QuestionInput {
  id: string;
  question: string;
}

export function buildAnswerPrompt(
  profile: CareerProfile,
  job: CanonicalJob,
  questions: QuestionInput[]
): string {
  const confirmedWork = (profile.workHistory || []).filter((w) => w.confirmed);
  const confirmedEdu = (profile.education || []).filter((e) => e.confirmed);
  const confirmedVol = (profile.volunteer || []).filter((v) => v.confirmed);

  return `
    CANDIDATE PROFILE
    Headline: ${profile.headline || 'not specified'}
    Seniority: ${profile.seniority || 'not specified'}
    Target titles: ${profile.targetTitles.join(', ') || 'not specified'}
    Work rights: ${profile.workRights || 'not specified'}

    Confirmed work history:
    ${confirmedWork.map((w) => `- ${w.role} at ${w.company} (${w.startDate || '?'}–${w.current ? 'now' : w.endDate || '?'}): ${w.summary || ''}`).join('\n') || '(none confirmed)'}

    Confirmed education:
    ${confirmedEdu.map((e) => `- ${e.degree || ''} ${e.field || ''} at ${e.school} (${e.endDate || '?'})`).join('\n') || '(none confirmed)'}

    Confirmed volunteering:
    ${confirmedVol.map((v) => `- ${v.role} at ${v.company}: ${v.summary || ''}`).join('\n') || '(none)'}

    Certifications: ${(profile.certifications || []).join(', ') || '(none)'}
    Awards: ${(profile.awards || []).join(', ') || '(none)'}

    Skills on record:
    ${(profile.derivedSkills || []).map((s) => `- ${s.name} (${s.confidence} confidence, from: ${s.source})`).join('\n') || '(none)'}

    THE JOB
    Title: ${job.title}
    Company: ${job.company}
    Location: ${job.location || 'not specified'}
    Description:
    ${(job.descriptionText || '').slice(0, 6000)}

    QUESTIONS THIS FORM ASKS
    ${questions.map((q) => `[${q.id}] ${q.question}`).join('\n')}

    Draft one answer per question, keyed by its id.
  `;
}

export function parseDraftedAnswers(raw: unknown): DraftedAnswer[] {
  const parsed = (raw ?? {}) as Record<string, any>;
  const list = Array.isArray(parsed.answers) ? parsed.answers : [];
  return list
    .filter((a: any) => a && typeof a.id === 'string' && typeof a.answer === 'string')
    .map((a: any) => ({
      id: String(a.id),
      answer: String(a.answer).trim(),
      // Absent means ungrounded: a model that forgot the flag has not earned
      // the benefit of the doubt on a claim going to an employer.
      grounded: a.grounded === true,
      gap: a.gap ? String(a.gap) : undefined,
    }));
}
