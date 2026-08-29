import { supabase } from '../supabaseClient';
import { analyzeResume } from '../geminiService';
import type { AnalysisResult, CanonicalJob, Language, ResumeContent, TailoredResume } from '../../types';

/**
 * Job-specific resume + cover letter.
 *
 * The generation step reuses the existing `analyzeResume` engine rather than
 * introducing a second resume generator: "tailor for this JD" is the same
 * operation the Resume Builder already performs.
 *
 * Storage does NOT reuse resume_history, despite the name — that table holds
 * whole-workspace snapshots for the History/restore drawer, not resumes. See
 * the header of 0004_applications.sql.
 */

interface TailoredResumeRow {
  id: number;
  user_id: string;
  job_id: number;
  content: AnalysisResult;
  cover_letter: string | null;
  model_version: string | null;
  created_at: string;
}

function rowToTailored(row: TailoredResumeRow): TailoredResume {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    content: row.content,
    coverLetter: row.cover_letter ?? undefined,
    modelVersion: row.model_version ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Generates a resume + cover letter targeted at `job` and saves it as a new
 * version. Generating twice for the same job produces two rows, so the user
 * can compare versions and an application always points at the exact one
 * that was submitted.
 *
 * `baseResume` is the user's existing resume — the source of truth for their
 * history. The model rewrites emphasis; it does not invent experience.
 */
export async function generateTailoredResume(
  userId: string,
  job: CanonicalJob,
  baseResume: ResumeContent | string,
  targetLang: Language = 'en'
): Promise<TailoredResume> {
  const resumeInput = typeof baseResume === 'string' ? baseResume : JSON.stringify(baseResume);
    /* The job's own market, not the user's setting: a Melbourne job gets a
     Western resume even for a user who mostly applies in China. */
  const result = await analyzeResume(job.descriptionText, resumeInput, targetLang, 'American', job.market);

  const { data, error } = await supabase
    .from('tailored_resumes')
    .insert({
      user_id: userId,
      job_id: job.id,
      content: result,
      cover_letter: result.coverLetter ?? null,
      model_version: 'gemini-flash-latest',
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToTailored(data as TailoredResumeRow);
}

/** Every version generated for one job, newest first. */
export async function listTailoredResumes(userId: string, jobId: number): Promise<TailoredResume[]> {
  const { data, error } = await supabase
    .from('tailored_resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as TailoredResumeRow[]).map(rowToTailored);
}

export async function getTailoredResume(userId: string, id: number): Promise<TailoredResume | null> {
  const { data, error } = await supabase
    .from('tailored_resumes')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToTailored(data as TailoredResumeRow) : null;
}
