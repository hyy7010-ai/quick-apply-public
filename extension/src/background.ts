import type { CanonicalJob, CanonicalJobInput, CareerProfile, Language, MatchSnapshot } from '../../types';
import { API_ORIGIN } from './config';
import {
  NotSignedIn,
  fetchBaseResume,
  fetchCareerProfile,
  latestSnapshotFor,
  saveApplication,
  answerQuestions,
  draftGreeting,
  getStoredLang,
  importProfileFromOwnResume,
  saveJob,
  scoreJob,
  setStoredLang,
  setSession,
  tailorResume,
  upsertProfile,
  type Session,
} from './api';

/**
 * Service worker. All network and storage work happens here rather than in the
 * content script: a content script is torn down on every navigation, and MV3
 * content scripts inherit the host page's CSP, which on sites like LinkedIn
 * would block calls to our own API.
 */

interface Ok<T> { ok: true; data: T }
interface Err { ok: false; error: string }
type Reply<T> = Ok<T> | Err;

const fail = (e: unknown): Err => {
  if (e instanceof NotSignedIn) return { ok: false, error: 'NOT_SIGNED_IN' };
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, error: message };
};

type Request =
  | { type: 'SESSION_SYNC'; session: Session | null; lang?: string | null }
  | { type: 'GET_STATE' }
  | { type: 'ANALYSE_JOB'; job: CanonicalJobInput; lang: Language; cost: number }
  | { type: 'SCORE'; job: CanonicalJob; lang: Language; cost: number }
  | { type: 'TAILOR'; job: CanonicalJob; lang: Language; cost: number }
  | { type: 'SAVE_APPLICATION'; jobId: number; matchSnapshotId?: number; tailoredResumeId?: number }
  | { type: 'SAVE_PROFILE'; profile: Partial<CareerProfile> }
  | { type: 'IMPORT_PROFILE'; lang: Language; cost: number }
  | { type: 'DRAFT_GREETING'; job: CanonicalJob; lang: Language; cost: number }
  | { type: 'ANSWER_QUESTIONS'; job: CanonicalJob; questions: { id: string; question: string }[]; lang: Language; cost: number }
  | { type: 'OPEN_APP'; path?: string };

chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
  handle(req).then(sendResponse).catch((e) => sendResponse(fail(e)));
  return true; // keep the channel open for the async reply
});

async function handle(req: Request): Promise<Reply<unknown>> {
  switch (req.type) {
    case 'SESSION_SYNC':
      await setSession(req.session);
      await setStoredLang(req.lang ?? null);
      return { ok: true, data: null };

    /** Content scripts cannot open tabs themselves under MV3. */
    case 'OPEN_APP':
      await chrome.tabs.create({ url: `${API_ORIGIN}/${req.path ?? ''}` });
      return { ok: true, data: null };

    case 'SAVE_PROFILE':
      try {
        return { ok: true, data: { profile: await upsertProfile(req.profile) } };
      } catch (e) {
        return fail(e);
      }

    case 'IMPORT_PROFILE':
      try {
        return { ok: true, data: { profile: await importProfileFromOwnResume(req.lang, req.cost) } };
      } catch (e) {
        return fail(e);
      }

    case 'DRAFT_GREETING':
      try {
        return { ok: true, data: { greeting: await draftGreeting(req.job, req.lang, req.cost) } };
      } catch (e) {
        return fail(e);
      }

    case 'ANSWER_QUESTIONS':
      try {
        return { ok: true, data: { answers: await answerQuestions(req.job, req.questions, req.lang, req.cost) } };
      } catch (e) {
        return fail(e);
      }

    case 'GET_STATE':
      try {
        const profile = await fetchCareerProfile();
        return { ok: true, data: { profile } };
      } catch (e) {
        return fail(e);
      }

    /**
     * Saves the job and returns any score it already has. Deliberately does not
     * score automatically: scoring costs a credit, and silently spending the
     * user's balance just because they opened a page would be indefensible.
     */
    case 'ANALYSE_JOB':
      try {
        const profile = await fetchCareerProfile();
        if (!profile) return { ok: false, error: 'NO_PROFILE' };
        const job = await saveJob(req.job);
        const snapshot = await latestSnapshotFor(job.id);
        const lang = await getStoredLang();
        return { ok: true, data: { job, profile, snapshot, lang } };
      } catch (e) {
        return fail(e);
      }

    case 'SCORE':
      try {
        const profile = await fetchCareerProfile();
        if (!profile) return { ok: false, error: 'NO_PROFILE' };
        const snapshot: MatchSnapshot = await scoreJob(profile, req.job, req.lang, req.cost);
        return { ok: true, data: { snapshot } };
      } catch (e) {
        return fail(e);
      }

    case 'TAILOR':
      try {
        const base = await fetchBaseResume();
        if (!base) return { ok: false, error: 'NO_BASE_RESUME' };
        const tailored = await tailorResume(req.job, base, req.lang, req.cost);
        return { ok: true, data: tailored };
      } catch (e) {
        return fail(e);
      }

    case 'SAVE_APPLICATION':
      try {
        await saveApplication(req.jobId, req.matchSnapshotId, req.tailoredResumeId);
        return { ok: true, data: null };
      } catch (e) {
        return fail(e);
      }

    default:
      return { ok: false, error: 'UNKNOWN_REQUEST' };
  }
}

export type { Reply, Request };
