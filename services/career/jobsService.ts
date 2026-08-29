import { supabase } from '../supabaseClient';
import type { CanonicalJob, CanonicalJobInput } from '../../types';

interface JobRow {
  id: number;
  user_id: string;
  source: string;
  market: CanonicalJob['market'];
  source_url: string | null;
  title: string;
  company: string;
  location: string | null;
  description_text: string;
  salary_text: string | null;
  employment_type: string | null;
  seniority: string | null;
  job_family: string | null;
  posted_at: string | null;
  is_stale: boolean;
  captured_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): CanonicalJob {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    market: row.market,
    sourceUrl: row.source_url ?? undefined,
    title: row.title,
    company: row.company,
    location: row.location ?? undefined,
    descriptionText: row.description_text,
    salaryText: row.salary_text ?? undefined,
    employmentType: row.employment_type ?? undefined,
    seniority: row.seniority ?? undefined,
    jobFamily: row.job_family ?? undefined,
    postedAt: row.posted_at ?? undefined,
    isStale: row.is_stale,
    capturedAt: row.captured_at,
    updatedAt: row.updated_at,
  };
}

export async function listJobs(userId: string): Promise<CanonicalJob[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false });

  if (error) throw error;
  return (data as JobRow[]).map(rowToJob);
}

export async function getJob(userId: string, jobId: number): Promise<CanonicalJob | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToJob(data as JobRow) : null;
}

/**
 * Creates a job from a CanonicalJobInput (produced by a connector — Phase 1
 * only ever passes ManualConnector's output, see connectors/manualConnector.ts).
 * `jobs_user_source_url_key` means re-submitting the same URL for the same
 * user upserts the existing row instead of creating a duplicate.
 */
export async function createJob(userId: string, input: CanonicalJobInput): Promise<CanonicalJob> {
  const { data, error } = await supabase
    .from('jobs')
    .upsert(
      {
        user_id: userId,
        source: input.source ?? 'manual',
        market: input.market,
        source_url: input.sourceUrl ?? null,
        title: input.title,
        company: input.company,
        location: input.location ?? null,
        description_text: input.descriptionText,
        salary_text: input.salaryText ?? null,
        employment_type: input.employmentType ?? null,
        seniority: input.seniority ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,source_url', ignoreDuplicates: false }
    )
    .select('*')
    .single();

  if (error) throw error;
  return rowToJob(data as JobRow);
}
