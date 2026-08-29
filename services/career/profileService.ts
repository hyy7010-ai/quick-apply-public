import { supabase } from '../supabaseClient';
import type { CareerProfile, CareerProfileInput } from '../../types';

/**
 * Career Profile CRUD. Talks directly to Supabase (anon key + RLS), the same
 * pattern the rest of the app already uses for resume_history/interview_history
 * — no server route needed. This keeps the function portable to the future
 * Chrome Extension, which will hit the same table under its own Supabase
 * session.
 */

interface CareerProfileRow {
  user_id: string;
  full_name: string | null;
  headline: string | null;
  target_titles: string[];
  target_locations: string[];
  target_industries: string[];
  seniority: string | null;
  work_rights: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  remote_preference: CareerProfile['remotePreference'] | null;
  languages: string[];
  source_resume_id: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  saved_answers: CareerProfile['savedAnswers'];
  derived_skills: CareerProfile['derivedSkills'];
  confirmed_facts: CareerProfile['confirmedFacts'];
  work_history: CareerProfile['workHistory'];
  education: CareerProfile['education'];
  certifications: string[];
  facts_confirmed_at: string | null;
  imported_from_resume_at: string | null;
  optional_demographics: CareerProfile['optionalDemographics'];
  updated_at: string;
}

function rowToProfile(row: CareerProfileRow): CareerProfile {
  return {
    userId: row.user_id,
    fullName: row.full_name ?? undefined,
    headline: row.headline ?? undefined,
    targetTitles: row.target_titles ?? [],
    targetLocations: row.target_locations ?? [],
    targetIndustries: row.target_industries ?? [],
    seniority: row.seniority ?? undefined,
    workRights: row.work_rights ?? undefined,
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    salaryCurrency: row.salary_currency ?? undefined,
    remotePreference: row.remote_preference ?? undefined,
    languages: row.languages ?? [],
    sourceResumeId: row.source_resume_id ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    savedAnswers: row.saved_answers ?? [],
    derivedSkills: row.derived_skills ?? [],
    confirmedFacts: row.confirmed_facts ?? [],
    workHistory: row.work_history ?? [],
    education: row.education ?? [],
    certifications: row.certifications ?? [],
    factsConfirmedAt: row.facts_confirmed_at ?? undefined,
    importedFromResumeAt: row.imported_from_resume_at ?? undefined,
    optionalDemographics: row.optional_demographics ?? {},
    updatedAt: row.updated_at,
  };
}

/** Returns null if the user hasn't created a profile yet — not an error. */
export async function getCareerProfile(userId: string): Promise<CareerProfile | null> {
  const { data, error } = await supabase
    .from('career_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToProfile(data as CareerProfileRow) : null;
}

/** Creates the profile on first save, updates it on every save after —
 * career_profiles.user_id is the primary key, so this is a plain upsert. */
export async function upsertCareerProfile(
  userId: string,
  input: CareerProfileInput
): Promise<CareerProfile> {
  const { data, error } = await supabase
    .from('career_profiles')
    .upsert(
      {
        user_id: userId,
        full_name: input.fullName ?? null,
        headline: input.headline ?? null,
        target_titles: input.targetTitles,
        target_locations: input.targetLocations,
        target_industries: input.targetIndustries,
        seniority: input.seniority ?? null,
        work_rights: input.workRights ?? null,
        salary_min: input.salaryMin ?? null,
        salary_max: input.salaryMax ?? null,
        salary_currency: input.salaryCurrency ?? null,
        remote_preference: input.remotePreference ?? null,
        languages: input.languages,
        source_resume_id: input.sourceResumeId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        linkedin_url: input.linkedinUrl ?? null,
        website_url: input.websiteUrl ?? null,
        saved_answers: input.savedAnswers ?? [],
        derived_skills: input.derivedSkills,
        confirmed_facts: input.confirmedFacts,
        work_history: input.workHistory,
        education: input.education,
        certifications: input.certifications,
        volunteer: input.volunteer ?? [],
        awards: input.awards ?? [],
        facts_confirmed_at: input.factsConfirmedAt ?? null,
        imported_from_resume_at: input.importedFromResumeAt ?? null,
        optional_demographics: input.optionalDemographics,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return rowToProfile(data as CareerProfileRow);
}
