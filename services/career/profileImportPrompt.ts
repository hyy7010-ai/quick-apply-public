import type { CareerProfile, JobMarket, Language } from '../../types';

/**
 * Resume -> Career Profile extraction, shared by the web app and the browser
 * extension so both read a resume the same way.
 *
 * Kept separate from profileImportService.ts for the same reason matchPrompt.ts
 * exists: the service builds a browser Supabase client and imports @google/genai,
 * neither of which survives in an MV3 service worker. This module holds only the
 * prompt, the response schema and the parser, and depends on nothing.
 *
 * Everything this produces is a SUGGESTION, not an established fact: work
 * history and education come back with `confirmed: false`, and skills carry a
 * confidence level. Callers must let the user confirm before any of it is used
 * for generation.
 */

const langNames: Record<Language, string> = {
  en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic',
};

/**
 * The demographic rule is the one place where a single global policy actively
 * harms half the users.
 *
 * A resume written for an Australian employer must not carry an age, a photo or
 * a gender: asking for them is discriminatory practice, and volunteering them
 * marks the candidate down. A Chinese resume normally carries all three, and
 * one that omits them can be filtered out before a human reads it. Refusing to
 * extract them everywhere protects one market and damages the other.
 *
 * What does NOT change with the market: none of this may ever reach scoring.
 * It is document content, extracted so a Chinese resume can be rendered
 * completely, and it stays out of the match prompt in both markets.
 */
export function buildImportSystemInstruction(
  targetLang: Language = 'en',
  market: JobMarket = 'AU'
): string {
  const demographics = market === 'CN'
    ? `A Chinese resume conventionally states age or date of birth, gender,
       hometown and marital status, and omitting them can get a candidate
       filtered out. Extract them when the resume states them, verbatim, into
       the demographics field. Never infer any of them — not gender from a
       name, not age from a graduation year. Omit whatever the resume does not
       say.`
    : `DO NOT extract age, date of birth, gender, marital status, nationality or
       photographs, even if the resume contains them. Employers in this market
       must not see them, and a resume that volunteers them is weaker, not
       stronger.`;

  return `
    Role: Resume Parser for a career profile.
    Extract ONLY what the resume actually states. Never infer, embellish, or
    fill gaps with plausible-sounding detail — a wrong fact here becomes a
    wrong claim in a job application.
    If a field is absent from the resume, omit it rather than guessing.
    For each skill, set confidence: "high" if backed by a specific role or
    project, "medium" if mentioned in context, "low" if only listed.
    "source" must quote where in the resume the skill came from.
    ${demographics}
    Output field values in ${langNames[targetLang]}.
  `;
}

export const IMPORT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    fullName: { type: 'STRING' },
    headline: { type: 'STRING', description: 'One-line professional positioning' },
    email: { type: 'STRING', description: 'Email address, verbatim. Omit if absent.' },
    phone: { type: 'STRING', description: 'Phone number, verbatim. Omit if absent.' },
    city: { type: 'STRING', description: 'City the candidate lives in. Omit if absent.' },
    country: { type: 'STRING', description: 'Country. Omit if not stated.' },
    linkedinUrl: { type: 'STRING', description: 'Full LinkedIn URL. Omit if absent.' },
    websiteUrl: { type: 'STRING', description: 'Portfolio, GitHub or personal site URL. Omit if absent.' },
    seniority: { type: 'STRING', description: 'e.g. Graduate, Mid, Senior' },
    languages: { type: 'ARRAY', items: { type: 'STRING' } },
    certifications: { type: 'ARRAY', items: { type: 'STRING' } },
    skills: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          confidence: { type: 'STRING' },
          source: { type: 'STRING' },
        },
        required: ['name', 'confidence', 'source'],
      },
    },
    workHistory: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING' },
          company: { type: 'STRING' },
          startDate: { type: 'STRING' },
          endDate: { type: 'STRING' },
          current: { type: 'BOOLEAN' },
          summary: { type: 'STRING' },
        },
        required: ['role', 'company'],
      },
    },
    volunteer: {
      type: 'ARRAY',
      description: 'Unpaid roles: societies, charities, community work, student clubs.',
      items: {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING' },
          company: { type: 'STRING', description: 'The organisation' },
          startDate: { type: 'STRING' },
          endDate: { type: 'STRING' },
          current: { type: 'BOOLEAN' },
          summary: { type: 'STRING' },
        },
        required: ['role', 'company'],
      },
    },
    awards: {
      type: 'ARRAY',
      description: 'Awards, honours, scholarships, competition placings.',
      items: { type: 'STRING' },
    },
    demographics: {
      type: 'OBJECT',
      description:
        'Only for the Chinese market, and only when the resume states them. Never inferred.',
      properties: {
        age: { type: 'STRING' },
        dateOfBirth: { type: 'STRING' },
        gender: { type: 'STRING' },
        hometown: { type: 'STRING' },
        maritalStatus: { type: 'STRING' },
      },
    },
    education: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          school: { type: 'STRING' },
          degree: { type: 'STRING' },
          field: { type: 'STRING' },
          startDate: { type: 'STRING' },
          endDate: { type: 'STRING' },
        },
        required: ['school'],
      },
    },
  },
  required: ['workHistory', 'education', 'skills'],
};

export interface ImportedProfile {
  fullName?: string;
  headline?: string;
  /** Contact details, pulled out of the resume's header so the extension can
   * fill application forms without the user retyping what the document
   * already says. Extracted verbatim — never inferred or reformatted. */
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  languages: string[];
  seniority?: string;
  derivedSkills: CareerProfile['derivedSkills'];
  workHistory: CareerProfile['workHistory'];
  education: CareerProfile['education'];
  certifications: string[];
  volunteer: CareerProfile['workHistory'];
  awards: string[];
  /** Chinese-market resume header fields. Document content only — the match
   *  prompt never receives these, in either market. */
  demographics?: Record<string, string>;
}

export function parseImportedProfile(raw: unknown, market: JobMarket = 'AU'): ImportedProfile {
  const parsed = (raw ?? {}) as Record<string, any>;
  const stamp = Date.now();
  const validConfidence = ['high', 'medium', 'low'];

  return {
    fullName: parsed.fullName || undefined,
    headline: parsed.headline || undefined,
    email: parsed.email || undefined,
    phone: parsed.phone || undefined,
    city: parsed.city || undefined,
    country: parsed.country || undefined,
    linkedinUrl: parsed.linkedinUrl || undefined,
    websiteUrl: parsed.websiteUrl || undefined,
    seniority: parsed.seniority || undefined,
    languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
    awards: Array.isArray(parsed.awards) ? parsed.awards : [],
    // Dropped outright outside China, whatever the model returned: a model that
    // ignored the instruction must not be the reason a protected attribute
    // reaches an Australian employer.
    demographics: market === 'CN' && parsed.demographics && typeof parsed.demographics === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.demographics)
            .filter(([, v]) => typeof v === 'string' && v.trim())
            .map(([k, v]) => [k, String(v).trim()])
        )
      : undefined,
    volunteer: (parsed.volunteer || []).map((v: any, i: number) => ({
      id: `vol-${stamp}-${i}`,
      role: String(v.role || ''),
      company: String(v.company || ''),
      startDate: v.startDate || undefined,
      endDate: v.endDate || undefined,
      current: !!v.current,
      summary: v.summary || undefined,
      confirmed: false,
    })),
    derivedSkills: (parsed.skills || []).map((s: any) => ({
      name: String(s.name),
      confidence: validConfidence.includes(s.confidence) ? s.confidence : 'low',
      source: String(s.source || ''),
    })),
    // confirmed: false — nothing imported counts as a fact until the user says so.
    workHistory: (parsed.workHistory || []).map((w: any, i: number) => ({
      id: `wh-${stamp}-${i}`,
      role: String(w.role || ''),
      company: String(w.company || ''),
      startDate: w.startDate || undefined,
      endDate: w.endDate || undefined,
      current: !!w.current,
      summary: w.summary || undefined,
      confirmed: false,
    })),
    education: (parsed.education || []).map((e: any, i: number) => ({
      id: `ed-${stamp}-${i}`,
      school: String(e.school || ''),
      degree: e.degree || undefined,
      field: e.field || undefined,
      startDate: e.startDate || undefined,
      endDate: e.endDate || undefined,
      confirmed: false,
    })),
  };
}
