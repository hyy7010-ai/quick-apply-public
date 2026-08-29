import { supabase } from '../supabaseClient';
import { generateJobMatchScore } from '../geminiService';
import type { CanonicalJob, CareerProfile, JobMatchResult, Language, MatchSnapshot } from '../../types';

interface MatchSnapshotRow {
  id: number;
  user_id: string;
  job_id: number;
  career_profile_snapshot: CareerProfile;
  overall_score: number;
  score_breakdown: MatchSnapshot['scoreBreakdown'];
  hard_gaps: string[];
  recommended_action: MatchSnapshot['recommendedAction'];
  model_version: string | null;
  created_at: string;
}

function rowToSnapshot(row: MatchSnapshotRow): MatchSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    careerProfileSnapshot: row.career_profile_snapshot,
    overallScore: row.overall_score,
    scoreBreakdown: row.score_breakdown,
    hardGaps: row.hard_gaps ?? [],
    recommendedAction: row.recommended_action,
    modelVersion: row.model_version ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Scores `job` against `profile` and persists the result as a new, immutable
 * match_snapshots row. Calling this twice for the same job produces two rows
 * — there is no update path, by design (see the migration's comment on
 * match_snapshots).
 */
export async function generateAndSaveMatchSnapshot(
  userId: string,
  profile: CareerProfile,
  job: CanonicalJob,
  targetLang: Language = 'en'
): Promise<MatchSnapshot> {
  const result: JobMatchResult = await generateJobMatchScore(profile, job, targetLang);

  const { data, error } = await supabase
    .from('match_snapshots')
    .insert({
      user_id: userId,
      job_id: job.id,
      career_profile_snapshot: profile,
      overall_score: result.overallScore,
      score_breakdown: result.scoreBreakdown,
      hard_gaps: result.hardGaps,
      recommended_action: result.recommendedAction,
      model_version: result.modelVersion ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToSnapshot(data as MatchSnapshotRow);
}

/** Most recent snapshot first — the UI shows the latest score by default but
 * can display prior ones (e.g. "you improved from 62% to 81%"). */
export async function listMatchSnapshots(userId: string, jobId: number): Promise<MatchSnapshot[]> {
  const { data, error } = await supabase
    .from('match_snapshots')
    .select('*')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as MatchSnapshotRow[]).map(rowToSnapshot);
}
