import React, { useState } from 'react';
import type { AnalysisResult, ApplicationWithJob, Language, ResumeContent } from '../types';
import { DEMO_USER_ID } from '../services/career/demoData';
import CareerProfileView from './career/CareerProfileView';
import JobsBoard from './career/JobsBoard';
import ApplicationTracker from './career/ApplicationTracker';

interface CareerAgentProps {
  lang: Language;
  isLoggedIn: boolean;
  userId: string | null;
  baseResume: ResumeContent | null;
  onLogin: () => void;
  onCheckCredits: (amount: number) => Promise<boolean>;
  onSpendCredits: (amount: number) => Promise<void>;
  /** Hands an application's JD to the existing Interview module. */
  onPrepareInterview: (application: ApplicationWithJob) => void;
  /** Opens a generated tailored resume in the existing Resume editor. */
  onOpenTailoredResume: (result: AnalysisResult) => void;
}

const t = (lang: Language, en: string, zh: string) => (lang === 'zh' ? zh : en);

/**
 * Top-level shell for the Career Agent module (Phase 1: Career Profile ->
 * Jobs -> Match -> Tailored materials -> Applications). Owns its own
 * sub-navigation so App.tsx only needs one new top-level branch instead of
 * growing its module switch further.
 */
export default function CareerAgent({
  lang, isLoggedIn, userId, baseResume, onLogin, onCheckCredits, onSpendCredits,
  onPrepareInterview, onOpenTailoredResume,
}: CareerAgentProps) {
  // Signed-out visitors get a worked example rather than a sign-in wall.
  // "What does this actually do" is the question a landing page has to answer,
  // and a login form answers it with "find out later".
  const demo = !isLoggedIn || !userId;
  const activeUserId = userId ?? DEMO_USER_ID;

  const [tab, setTab] = useState<'profile' | 'jobs' | 'applications'>(demo ? 'jobs' : 'profile');
  // Bumped when a job is saved as an application, so the tracker refetches
  // when the user switches to it.
  const [trackerKey, setTrackerKey] = useState(0);

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
      active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-indigo-600'
    }`;

  return (
    <div>
      {demo && (
        <div className="max-w-4xl mx-auto px-6 pt-8">
          <div className="rounded-[1.75rem] border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-6 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1">
              <span className="inline-flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
                  {t(lang, 'Example', '示例')}
                </span>
              </span>
              <p className="text-sm font-bold text-slate-900">
                {t(lang,
                  'This is a worked example, not your data.',
                  '这是一份示例,不是你的数据。')}
              </p>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                {t(lang,
                  'A fictional graduate, three real scores including one the agent says to skip. Sign in to run it on your own resume.',
                  '一位虚构的应届生,三个真实打分,其中一个是"不建议投"。登录后可以用你自己的简历跑一遍。')}
              </p>
            </div>
            <button
              onClick={onLogin}
              className="shrink-0 px-6 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black hover:bg-indigo-600 hover:-translate-y-0.5 transition-all shadow-lg shadow-slate-900/10"
            >
              {t(lang, 'Use my resume', '用我的简历')}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-2 py-4 border-b border-slate-100">
        <button onClick={() => setTab('profile')} className={tabClass(tab === 'profile')}>
          {t(lang, 'Career Profile', 'Career Profile')}
        </button>
        <button onClick={() => setTab('jobs')} className={tabClass(tab === 'jobs')}>
          {t(lang, 'Jobs', 'Jobs')}
        </button>
        <button onClick={() => setTab('applications')} className={tabClass(tab === 'applications')}>
          {t(lang, 'Applications', 'Applications')}
        </button>
      </div>

      {tab === 'profile' && (
        <CareerProfileView
          userId={activeUserId}
          lang={lang}
          demo={demo}
          onCheckCredits={onCheckCredits}
          onSpendCredits={onSpendCredits}
        />
      )}
      {tab === 'jobs' && (
        <JobsBoard
          userId={activeUserId}
          lang={lang}
          demo={demo}
          onLogin={onLogin}
          baseResume={baseResume}
          onCheckCredits={onCheckCredits}
          onSpendCredits={onSpendCredits}
          onApplicationCreated={() => setTrackerKey((k) => k + 1)}
          onOpenTailoredResume={onOpenTailoredResume}
        />
      )}
      {tab === 'applications' && (
        <ApplicationTracker
          key={trackerKey}
          userId={activeUserId}
          lang={lang}
          demo={demo}
          onLogin={onLogin}
          onPrepareInterview={onPrepareInterview}
        />
      )}
    </div>
  );
}
