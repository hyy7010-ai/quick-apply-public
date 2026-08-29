import { supabase } from '../supabaseClient';
import type {
  Application,
  ApplicationStatus,
  ApplicationStatusEvent,
  ApplicationWithJob,
  AppliedVia,
  CanonicalJob,
  QuestionAnswer,
} from '../../types';

interface ApplicationRow {
  id: number;
  user_id: string;
  job_id: number;
  match_snapshot_id: number | null;
  tailored_resume_id: number | null;
  status: ApplicationStatus;
  applied_via: AppliedVia | null;
  applied_at: string | null;
  question_answers: QuestionAnswer[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    matchSnapshotId: row.match_snapshot_id ?? undefined,
    tailoredResumeId: row.tailored_resume_id ?? undefined,
    status: row.status,
    appliedVia: row.applied_via ?? undefined,
    appliedAt: row.applied_at ?? undefined,
    questionAnswers: row.question_answers ?? [],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Shape of the embedded job row PostgREST returns for the `jobs (*)` join. */
interface JobEmbed {
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

function embedToJob(j: JobEmbed): CanonicalJob {
  return {
    id: j.id,
    userId: j.user_id,
    source: j.source,
    market: j.market,
    sourceUrl: j.source_url ?? undefined,
    title: j.title,
    company: j.company,
    location: j.location ?? undefined,
    descriptionText: j.description_text,
    salaryText: j.salary_text ?? undefined,
    employmentType: j.employment_type ?? undefined,
    seniority: j.seniority ?? undefined,
    jobFamily: j.job_family ?? undefined,
    postedAt: j.posted_at ?? undefined,
    isStale: j.is_stale,
    capturedAt: j.captured_at,
    updatedAt: j.updated_at,
  };
}

/** Everything the tracker board needs, in one query. */
export async function listApplications(userId: string): Promise<ApplicationWithJob[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('*, jobs (*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data as (ApplicationRow & { jobs: JobEmbed })[]).map((row) => ({
    ...rowToApplication(row),
    job: embedToJob(row.jobs),
  }));
}

/**
 * Existing non-withdrawn applications for a job. The UI uses this to warn
 * about a duplicate application rather than to block one — re-applying after
 * enough time has passed is legitimate, so this is deliberately advisory.
 */
export async function findExistingApplications(
  userId: string,
  jobId: number
): Promise<Application[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .neq('status', 'withdrawn');

  if (error) throw error;
  return (data as ApplicationRow[]).map(rowToApplication);
}

export interface CreateApplicationInput {
  jobId: number;
  matchSnapshotId?: number;
  tailoredResumeId?: number;
  status?: ApplicationStatus;
  notes?: string;
}

/** Creates an application and its first status-history entry. */
export async function createApplication(
  userId: string,
  input: CreateApplicationInput
): Promise<Application> {
  const status = input.status ?? 'saved';

  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      job_id: input.jobId,
      match_snapshot_id: input.matchSnapshotId ?? null,
      tailored_resume_id: input.tailoredResumeId ?? null,
      status,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  const application = rowToApplication(data as ApplicationRow);

  await recordStatusChange(userId, application.id, status, 'Application created');
  return application;
}

/**
 * Moves an application to a new status and appends to its audit trail.
 *
 * `applied_at` is stamped the first time it reaches 'applied' and never
 * rewritten afterwards — later stage changes must not move the submission
 * date that outcome analysis measures from.
 */
export async function updateApplicationStatus(
  userId: string,
  applicationId: number,
  status: ApplicationStatus,
  note?: string
): Promise<Application> {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'applied') {
    const { data: current } = await supabase
      .from('applications')
      .select('applied_at')
      .eq('user_id', userId)
      .eq('id', applicationId)
      .maybeSingle();
    if (!current?.applied_at) {
      patch.applied_at = new Date().toISOString();
      patch.applied_via = 'manual';
    }
  }

  const { data, error } = await supabase
    .from('applications')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', applicationId)
    .select('*')
    .single();

  if (error) throw error;

  await recordStatusChange(userId, applicationId, status, note);
  return rowToApplication(data as ApplicationRow);
}

/** Attaches a generated resume version to an application. */
export async function attachTailoredResume(
  userId: string,
  applicationId: number,
  tailoredResumeId: number
): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ tailored_resume_id: tailoredResumeId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', applicationId);

  if (error) throw error;
}

async function recordStatusChange(
  userId: string,
  applicationId: number,
  status: ApplicationStatus,
  note?: string
): Promise<void> {
  const { error } = await supabase.from('application_status_history').insert({
    user_id: userId,
    application_id: applicationId,
    status,
    note: note ?? null,
  });
  // The audit row is secondary to the status change itself; log rather than
  // fail the whole operation and leave the user unsure whether it applied.
  if (error) console.error('Failed to record status history:', error.message);
}

export async function listStatusHistory(
  userId: string,
  applicationId: number
): Promise<ApplicationStatusEvent[]> {
  const { data, error } = await supabase
    .from('application_status_history')
    .select('*')
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .order('changed_at', { ascending: true });

  if (error) throw error;
  return (data as { id: number; application_id: number; status: ApplicationStatus; note: string | null; changed_at: string }[]).map((r) => ({
    id: r.id,
    applicationId: r.application_id,
    status: r.status,
    note: r.note ?? undefined,
    changedAt: r.changed_at,
  }));
}
