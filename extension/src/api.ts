import type {
  AnalysisResult,
  CanonicalJob,
  CanonicalJobInput,
  CareerProfile,
  JobMarket,
  JobMatchResult,
  Language,
  MatchSnapshot,
} from '../../types';
import {
  MATCH_MODEL,
  MATCH_RESPONSE_SCHEMA,
  buildMatchPrompt,
  buildMatchSystemInstruction,
  parseMatchResult,
} from '../../services/career/matchPrompt';
import {
  GREETING_RESPONSE_SCHEMA,
  buildGreetingPrompt,
  buildGreetingSystemInstruction,
  parseGreeting,
  type DraftedGreeting,
} from '../../services/career/greetingPrompt';
import {
  ANSWER_RESPONSE_SCHEMA,
  buildAnswerPrompt,
  buildAnswerSystemInstruction,
  parseDraftedAnswers,
  type DraftedAnswer,
  type QuestionInput,
} from '../../services/career/answerPrompt';
import {
  IMPORT_RESPONSE_SCHEMA,
  buildImportSystemInstruction,
  parseImportedProfile,
} from '../../services/career/profileImportPrompt';
import { API_ORIGIN, SESSION_STORAGE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL, STORED_SESSION } from './config';

/**
 * The extension's data layer.
 *
 * It calls the same PostgREST tables and the same /api/gemini proxy as the web
 * app, with the user's own JWT, so row level security and credit deduction
 * apply identically. It deliberately does NOT bundle supabase-js or import
 * services/career/*Service.ts: those construct a browser Supabase client from
 * import.meta.env, which does not exist in a service worker. Plain fetch
 * against PostgREST is a few lines and avoids reshaping working web-app code.
 *
 * What IS shared is the part that matters — the scoring prompt and schema,
 * imported from services/career/matchPrompt.ts.
 */

export interface Session {
  access_token: string;
  user: { id: string; email?: string };
}

export async function getSession(): Promise<Session | null> {
  const stored = (await chrome.storage.local.get(STORED_SESSION)) as Record<string, Session | undefined>;
  if (stored[STORED_SESSION]) return stored[STORED_SESSION]!;
  return pullSessionFromOpenApp();
}

/**
 * Last resort before declaring the user signed out: read the session straight
 * out of an open FastResume tab.
 *
 * The content script only harvests the session when one of those pages loads,
 * so reloading the extension, which wipes its storage, left the panel claiming
 * "not signed in" beside a browser tab that was plainly signed in, and the only
 * cure was reloading the web app in exactly the right order. Pulling makes the
 * order stop mattering.
 */
async function pullSessionFromOpenApp(): Promise<Session | null> {
  try {
    const tabs = await chrome.tabs.query({ url: [`${API_ORIGIN}/*`, 'https://fastresume.xyz/*'] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [SESSION_STORAGE_KEY],
        func: (key: string) => {
          try {
            const raw = localStorage.getItem(key);
            const lang = localStorage.getItem('lang');
            if (!raw) return null;
            const p = JSON.parse(raw);
            if (!p?.access_token || !p?.user?.id) return null;
            return { access_token: p.access_token, user: { id: p.user.id, email: p.user.email }, lang };
          } catch {
            return null;
          }
        },
      });
      const found = res?.result as (Session & { lang?: string | null }) | null | undefined;
      if (found?.access_token) {
        const session: Session = { access_token: found.access_token, user: found.user };
        await setSession(session);
        if (found.lang) await setStoredLang(found.lang);
        return session;
      }
    }
  } catch {
    // No open app tab, or no permission for it. Fall through to signed out.
  }
  return null;
}

export async function setSession(session: Session | null): Promise<void> {
  if (session) await chrome.storage.local.set({ [STORED_SESSION]: session });
  else await chrome.storage.local.remove(STORED_SESSION);
}

const STORED_LANG = 'fastresume_lang';

/** The language the user chose in the web app, mirrored so the panel can use
 * it instead of guessing from the browser locale. */
export async function setStoredLang(lang: string | null): Promise<void> {
  if (lang) await chrome.storage.local.set({ [STORED_LANG]: lang });
}

export async function getStoredLang(): Promise<string | null> {
  const stored = await chrome.storage.local.get(STORED_LANG);
  const lang = stored[STORED_LANG];
  return typeof lang === 'string' ? lang : null;
}

class NotSignedIn extends Error {
  constructor() {
    super('NOT_SIGNED_IN');
    this.name = 'NotSignedIn';
  }
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (res.status === 401) {
    // The stored token expired. Drop it so the UI prompts a fresh sign-in
    // rather than silently failing every call from here on.
    await setSession(null);
    throw new NotSignedIn();
  }
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const snake = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v])
  );

const camel = <T,>(row: Record<string, any>): T =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])
  ) as T;

export async function fetchCareerProfile(): Promise<CareerProfile | null> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();
  const rows = await rest<Record<string, any>[]>(
    `career_profiles?user_id=eq.${session.user.id}&select=*&limit=1`
  );
  return rows.length ? camel<CareerProfile>(rows[0]) : null;
}

/** Upserts by (user_id, source_url), so re-opening the same ad reuses the row
 * instead of piling up duplicates every visit. */
export async function saveJob(input: CanonicalJobInput): Promise<CanonicalJob> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();

  const rows = await rest<Record<string, any>[]>(
    'jobs?on_conflict=user_id,source_url&select=*',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(snake({ ...input, userId: session.user.id, updatedAt: new Date().toISOString() })),
    }
  );
  return camel<CanonicalJob>(rows[0]);
}

export async function latestSnapshotFor(jobId: number): Promise<MatchSnapshot | null> {
  const rows = await rest<Record<string, any>[]>(
    `match_snapshots?job_id=eq.${jobId}&select=*&order=created_at.desc&limit=1`
  );
  return rows.length ? camel<MatchSnapshot>(rows[0]) : null;
}

async function callGemini(body: unknown): Promise<string> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();

  const res = await fetch(`${API_ORIGIN}/api/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    await setSession(null);
    throw new NotSignedIn();
  }
  if (res.status === 402) throw new Error('OUT_OF_CREDITS');
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: '' }));
    throw new Error(error || `AI request failed (${res.status})`);
  }
  return (await res.json()).text || '{}';
}

async function spendCredits(amount: number): Promise<void> {
  const session = await getSession();
  if (!session) return;
  // Charged only after the work succeeded, matching the web app: a failed
  // generation must not cost anything.
  await fetch(`${API_ORIGIN}/api/deduct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ amount }),
  }).catch(() => undefined);
}

/** Scores the job and persists an immutable snapshot, exactly as the web app
 * does — same prompt, same schema, same table. */
export async function scoreJob(
  profile: CareerProfile,
  job: CanonicalJob,
  lang: Language,
  cost: number
): Promise<MatchSnapshot> {
  const text = await callGemini({
    method: 'generateContent',
    model: MATCH_MODEL,
    contents: buildMatchPrompt(profile, job),
    config: {
      systemInstruction: buildMatchSystemInstruction(lang),
      responseMimeType: 'application/json',
      responseSchema: MATCH_RESPONSE_SCHEMA,
    },
  });

  const result: JobMatchResult = parseMatchResult(JSON.parse(text));
  await spendCredits(cost);

  const session = (await getSession())!;
  const rows = await rest<Record<string, any>[]>('match_snapshots?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: session.user.id,
      job_id: job.id,
      career_profile_snapshot: profile,
      overall_score: result.overallScore,
      score_breakdown: result.scoreBreakdown,
      hard_gaps: result.hardGaps,
      recommended_action: result.recommendedAction,
      model_version: result.modelVersion,
    }),
  });
  return camel<MatchSnapshot>(rows[0]);
}

/** Tailored resume + cover letter for this job, saved to tailored_resumes. */
export async function tailorResume(
  job: CanonicalJob,
  baseResume: unknown,
  lang: Language,
  cost: number
): Promise<{ id: number; content: AnalysisResult }> {
  const langName =
    { en: 'English', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', es: 'Spanish', de: 'German', fr: 'French', ar: 'Arabic' }[
      lang
    ] || 'English';

  const text = await callGemini({
    method: 'generateContent',
    model: MATCH_MODEL,
    contents: `
      [TARGET JD]
      ${job.descriptionText}
      [RESUME SOURCE]
      ${typeof baseResume === 'string' ? baseResume : JSON.stringify(baseResume)}
    `,
    config: {
      systemInstruction: `
        Role: Expert Resume Strategist.
        Rewrite emphasis and wording so the resume speaks to this specific JD.
        GROUNDING: use only experience present in [RESUME SOURCE]. Never invent
        roles, dates, skills or achievements the candidate did not state.
        Also write a 300-400 word cover letter grounded in the same facts.
        Output ONLY in ${langName}.
      `,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          overallScore: { type: 'NUMBER' },
          missingSkills: { type: 'ARRAY', items: { type: 'STRING' } },
          coverLetter: { type: 'STRING' },
          optimizedResume: {
            type: 'OBJECT',
            properties: {
              fullName: { type: 'STRING' },
              jobTitle: { type: 'STRING' },
              summary: { type: 'STRING' },
              technicalSkills: { type: 'ARRAY', items: { type: 'STRING' } },
              experiences: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    role: { type: 'STRING' },
                    company: { type: 'STRING' },
                    period: { type: 'STRING' },
                    bullets: { type: 'ARRAY', items: { type: 'STRING' } },
                  },
                  required: ['role', 'company', 'bullets'],
                },
              },
            },
            required: ['fullName', 'summary', 'experiences'],
          },
        },
        required: ['optimizedResume', 'coverLetter'],
      },
    },
  });

  const content = JSON.parse(text) as AnalysisResult;
  await spendCredits(cost);

  const session = (await getSession())!;
  const rows = await rest<Record<string, any>[]>('tailored_resumes?select=id,content', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: session.user.id,
      job_id: job.id,
      content,
      cover_letter: content.coverLetter ?? null,
      model_version: MATCH_MODEL,
    }),
  });
  return { id: rows[0].id, content };
}

/** Most recent base resume saved by the web app, used as the tailoring source. */
/**
 * Writes the profile from the panel.
 *
 * Column names are spelled out rather than derived, because a silent typo here
 * writes nothing and PostgREST reports success: an unknown key is ignored, not
 * rejected.
 */
/**
 * Drafts answers to the open questions on an application form.
 *
 * One call for every question on the page rather than one per field: cheaper,
 * and the answers come out consistent with each other instead of three
 * separately-invented versions of the same career.
 *
 * Answers are also written back to the profile's saved_answers, because the
 * same questions recur on nearly every form. The second application should not
 * cost what the first one did.
 */
export async function answerQuestions(
  job: CanonicalJob,
  questions: QuestionInput[],
  lang: Language,
  cost: number
): Promise<DraftedAnswer[]> {
  const profile = await fetchCareerProfile();
  if (!profile) throw new Error('NO_PROFILE');

  const text = await callGemini({
    method: 'generateContent',
    model: 'gemini-flash-latest',
    contents: buildAnswerPrompt(profile, job, questions),
    config: {
      systemInstruction: buildAnswerSystemInstruction(lang),
      responseMimeType: 'application/json',
      responseSchema: ANSWER_RESPONSE_SCHEMA,
    },
  });

  const answers = parseDraftedAnswers(JSON.parse(text));
  await spendCredits(cost);

  const asked = new Map(questions.map((q) => [q.id, q.question]));
  const kept = [
    ...(profile.savedAnswers || []).filter(
      (a: any) => !answers.some((n) => asked.get(n.id) === a.question)
    ),
    ...answers.map((a) => ({ question: asked.get(a.id) || '', answer: a.answer })),
  ].filter((a) => a.question);
  await upsertProfile({ savedAnswers: kept as CareerProfile['savedAnswers'] });

  return answers;
}

/** The opening message on a chat-first board, where there is no form to fill. */
export async function draftGreeting(
  job: CanonicalJob,
  lang: Language,
  cost: number
): Promise<DraftedGreeting> {
  const profile = await fetchCareerProfile();
  if (!profile) throw new Error('NO_PROFILE');

  const text = await callGemini({
    method: 'generateContent',
    model: 'gemini-flash-latest',
    contents: buildGreetingPrompt(profile, job),
    config: {
      systemInstruction: buildGreetingSystemInstruction(lang),
      responseMimeType: 'application/json',
      responseSchema: GREETING_RESPONSE_SCHEMA,
    },
  });

  const greeting = parseGreeting(JSON.parse(text));
  await spendCredits(cost);
  return greeting;
}

export async function upsertProfile(input: Partial<CareerProfile>): Promise<CareerProfile> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();

  const row: Record<string, unknown> = { user_id: session.user.id, updated_at: new Date().toISOString() };
  const put = (col: string, v: unknown) => { if (v !== undefined) row[col] = v; };
  put('full_name', input.fullName);
  put('headline', input.headline);
  put('target_titles', input.targetTitles);
  put('target_locations', input.targetLocations);
  put('target_industries', input.targetIndustries);
  put('seniority', input.seniority);
  put('work_rights', input.workRights);
  put('salary_min', input.salaryMin);
  put('salary_max', input.salaryMax);
  put('salary_currency', input.salaryCurrency);
  put('remote_preference', input.remotePreference);
  put('languages', input.languages);
  put('email', input.email);
  put('phone', input.phone);
  put('city', input.city);
  put('country', input.country);
  put('linkedin_url', input.linkedinUrl);
  put('website_url', input.websiteUrl);
  put('derived_skills', input.derivedSkills);
  put('work_history', input.workHistory);
  put('education', input.education);
  put('certifications', input.certifications);
  put('volunteer', input.volunteer);
  put('awards', input.awards);
  put('imported_from_resume_at', input.importedFromResumeAt);
  put('saved_answers', input.savedAnswers);

  const rows = await rest<Record<string, any>[]>('career_profiles?on_conflict=user_id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  return camel<CareerProfile>(rows[0]);
}

/**
 * Fills the experience half of the profile from the resume already in the
 * user's account, so the panel never has to ask for a file upload.
 *
 * Scoring reads two halves: targets and hard constraints, which a short form
 * can capture, and confirmed work history, education and skills, which only a
 * resume can supply. Without the second half the skills dimension scores near
 * zero and every job looks like a bad fit for the wrong reason.
 */
export async function importProfileFromOwnResume(
  lang: Language,
  cost: number,
  market: JobMarket = 'AU'
): Promise<CareerProfile> {
  const resume = await fetchBaseResume();
  if (!resume) throw new Error('NO_BASE_RESUME');

  const text = await callGemini({
    method: 'generateContent',
    model: 'gemini-flash-latest',
    contents: `Extract the career profile from this resume:\n\n${JSON.stringify(resume)}`,
    config: {
      systemInstruction: buildImportSystemInstruction(lang, market),
      responseMimeType: 'application/json',
      responseSchema: IMPORT_RESPONSE_SCHEMA,
    },
  });

  const imported = parseImportedProfile(JSON.parse(text), market);
  await spendCredits(cost);

  return upsertProfile({
    fullName: imported.fullName,
    headline: imported.headline,
    email: imported.email,
    phone: imported.phone,
    city: imported.city,
    country: imported.country,
    linkedinUrl: imported.linkedinUrl,
    websiteUrl: imported.websiteUrl,
    seniority: imported.seniority,
    languages: imported.languages,
    certifications: imported.certifications,
    volunteer: imported.volunteer,
    awards: imported.awards,
    derivedSkills: imported.derivedSkills,
    workHistory: imported.workHistory,
    education: imported.education,
    importedFromResumeAt: new Date().toISOString(),
    optionalDemographics: (imported.demographics || {}) as CareerProfile['optionalDemographics'],
  });
}

export async function fetchBaseResume(): Promise<unknown | null> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();
  const rows = await rest<Record<string, any>[]>(
    `resume_history?user_id=eq.${session.user.id}&select=content&order=created_at.desc&limit=1`
  );
  // resume_history stores a whole-workspace snapshot, not a bare resume —
  // see 0004_applications.sql for why. Reach into it for the resume itself.
  const content = rows[0]?.content;
  return content?.resumeContent ?? content ?? null;
}

export async function saveApplication(
  jobId: number,
  matchSnapshotId?: number,
  tailoredResumeId?: number
): Promise<void> {
  const session = await getSession();
  if (!session) throw new NotSignedIn();
  const rows = await rest<Record<string, any>[]>('applications?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: session.user.id,
      job_id: jobId,
      match_snapshot_id: matchSnapshotId ?? null,
      tailored_resume_id: tailoredResumeId ?? null,
      status: 'saved',
    }),
  });
  await rest('application_status_history', {
    method: 'POST',
    body: JSON.stringify({
      user_id: session.user.id,
      application_id: rows[0].id,
      status: 'saved',
      note: 'Saved from the browser extension',
    }),
  });
}

export { NotSignedIn };
