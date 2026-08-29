import type { CanonicalJob, CareerProfile, Language } from '../../types';

/**
 * The opening message on a chat-first job board.
 *
 * BOSS直聘, 猎聘 and their peers have no application form. You press 立即沟通
 * and send a recruiter a message, and that message is the application. The
 * panel's whole fill-and-submit design assumes a form with fields in it, so on
 * these sites it correctly finds nothing and is correctly useless. This is the
 * thing that actually needs writing there.
 *
 * A greeting is not a cover letter with the fat trimmed. It is read on a phone,
 * in a list beside thirty others, by someone deciding in about two seconds
 * whether to reply. Length is the whole discipline: three or four sentences,
 * one concrete fact, one question that is easy to answer.
 *
 * Grounding is the same hard rule as everywhere else. This message goes to a
 * real person under the user's name, so an invented project is not a
 * hallucination to shrug at.
 */

const langNames: Record<Language, string> = {
  en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic',
};

export function buildGreetingSystemInstruction(targetLang: Language = 'zh'): string {
  return `
    Role: You write the opening message a candidate sends to a recruiter on a
    chat-first job board, in the candidate's own voice, for them to review
    before sending.

    GROUNDING — the rule that overrides everything else:
    Every concrete claim must trace to the CANDIDATE PROFILE. Do not invent
    employers, projects, numbers, tools or outcomes, and do not upgrade a
    "familiar with" into "proficient in". If the profile cannot support a claim
    the job asks for, leave it out and set "grounded" to false. This message is
    sent to a real person under the candidate's name.

    FORM:
    Three to four short sentences, under 150 characters of Chinese where the
    language is Chinese. It is read on a phone, in a list beside thirty others.
    1. A plain greeting and who the candidate is, in one line.
    2. The single most relevant concrete fact from the profile for THIS job —
       one fact, named specifically, not a list of adjectives.
    3. A short, easy question or a request to talk further.

    DO NOT:
    - open with 贵公司 flattery, or any sentence about being passionate
    - restate the job advert back to the recruiter, who wrote it
    - attach a life story, list every skill, or use bullet points
    - promise availability, salary or visa terms — the candidate answers those

    Write in ${langNames[targetLang]}.
  `;
}

export const GREETING_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    message: { type: 'STRING', description: 'The greeting, ready to send' },
    grounded: {
      type: 'BOOLEAN',
      description: 'False when the profile does not support what the job asks for',
    },
    gap: {
      type: 'STRING',
      description: 'When grounded is false, what the profile is missing. Omit otherwise.',
    },
  },
  required: ['message', 'grounded'],
};

export interface DraftedGreeting {
  message: string;
  grounded: boolean;
  gap?: string;
}

export function buildGreetingPrompt(profile: CareerProfile, job: CanonicalJob): string {
  const work = (profile.workHistory || []).filter((w) => w.confirmed);
  const vol = (profile.volunteer || []).filter((v) => v.confirmed);

  return `
    CANDIDATE PROFILE
    Headline: ${profile.headline || 'not specified'}
    Seniority: ${profile.seniority || 'not specified'}
    Work rights: ${profile.workRights || 'not specified'}

    Confirmed work history:
    ${work.map((w) => `- ${w.role} at ${w.company}: ${w.summary || ''}`).join('\n') || '(none confirmed)'}

    Confirmed volunteering:
    ${vol.map((v) => `- ${v.role} at ${v.company}: ${v.summary || ''}`).join('\n') || '(none)'}

    Skills on record:
    ${(profile.derivedSkills || []).map((s) => `- ${s.name} (${s.confidence}, from: ${s.source})`).join('\n') || '(none)'}

    Certifications: ${(profile.certifications || []).join(', ') || '(none)'}
    Awards: ${(profile.awards || []).join(', ') || '(none)'}

    THE JOB
    ${job.title} at ${job.company}${job.location ? `, ${job.location}` : ''}
    ${(job.descriptionText || '').slice(0, 4000)}

    Write the opening message.
  `;
}

export function parseGreeting(raw: unknown): DraftedGreeting {
  const p = (raw ?? {}) as Record<string, any>;
  return {
    message: String(p.message || '').trim(),
    // Absent counts as ungrounded: a model that forgot the flag has not earned
    // the benefit of the doubt on a message going to a real recruiter.
    grounded: p.grounded === true,
    gap: p.gap ? String(p.gap) : undefined,
  };
}
