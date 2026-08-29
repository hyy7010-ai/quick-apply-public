import React, { useEffect, useState } from 'react';
import type { ApplicationStatus, ApplicationStatusEvent, ApplicationWithJob, Language } from '../../types';
import { listApplications, listStatusHistory, updateApplicationStatus } from '../../services/career/applicationsService';
import { demoApplications, getDemoStatusHistory } from '../../services/career/demoData';
import { Alert, Button, Chip, MicroLabel, Panel, ScreenHeading, Select } from './ui';

interface ApplicationTrackerProps {
  userId: string;
  lang: Language;
  /** Opens the existing Interview module with this application's JD loaded. */
  onPrepareInterview: (application: ApplicationWithJob) => void;
  /** Read-only worked example for signed-out visitors. */
  demo?: boolean;
  onLogin?: () => void;
}

const t = (lang: Language, en: string, zh: string) => (lang === 'zh' ? zh : en);

const COLUMNS: ApplicationStatus[] = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected'];

const STATUS_LABEL: Record<ApplicationStatus, { en: string; zh: string }> = {
  saved: { en: 'Saved', zh: '已保存' },
  preparing: { en: 'Preparing', zh: '准备中' },
  applied: { en: 'Applied', zh: '已投递' },
  interviewing: { en: 'Interview', zh: '面试中' },
  offer: { en: 'Offer', zh: 'Offer' },
  rejected: { en: 'Rejected', zh: '被拒' },
  withdrawn: { en: 'Withdrawn', zh: '已撤回' },
};

const STATUS_TINT: Record<ApplicationStatus, string> = {
  saved: 'bg-slate-50 text-slate-500 border-slate-200',
  preparing: 'bg-amber-50 text-amber-700 border-amber-100',
  applied: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  interviewing: 'bg-violet-50 text-violet-700 border-violet-100',
  offer: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  rejected: 'bg-rose-50 text-rose-600 border-rose-100',
  withdrawn: 'bg-slate-50 text-slate-300 border-slate-200',
};

function ApplicationCard({
  app,
  lang,
  onMove,
  onPrepareInterview,
  busy,
  demo = false,
}: {
  app: ApplicationWithJob;
  lang: Language;
  onMove: (app: ApplicationWithJob, status: ApplicationStatus) => void;
  onPrepareInterview: (app: ApplicationWithJob) => void;
  busy: boolean;
  demo?: boolean;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ApplicationStatusEvent[] | null>(null);

  const loadHistory = async () => {
    setShowHistory((s) => !s);
    if (demo) {
      setHistory(getDemoStatusHistory(lang).filter((h) => h.applicationId === app.id));
      return;
    }
    if (!history) {
      try {
        setHistory(await listStatusHistory(app.userId, app.id));
      } catch {
        setHistory([]);
      }
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3 shadow-sm hover:shadow-lg hover:border-slate-200 transition-all duration-300">
      <div>
        <p className="font-black text-sm text-slate-900 leading-snug">{app.job.title}</p>
        <p className="text-xs font-medium text-slate-500 mt-0.5">{app.job.company}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mt-1">
          {app.job.location || '—'} · {app.job.market}
        </p>
      </div>

      {(app.matchSnapshotId || app.tailoredResumeId) && (
        <div className="flex flex-wrap gap-1.5">
          {app.matchSnapshotId && <Chip tone="indigo">{t(lang, 'Match', '匹配')}</Chip>}
          {app.tailoredResumeId && <Chip tone="emerald">{t(lang, 'Resume', '简历')}</Chip>}
        </div>
      )}

      <Select
        value={app.status}
        disabled={busy}
        onChange={(e) => onMove(app, e.target.value as ApplicationStatus)}
        className="!px-3 !py-2 text-xs !rounded-xl"
      >
        {(Object.keys(STATUS_LABEL) as ApplicationStatus[]).map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s][lang === 'zh' ? 'zh' : 'en']}</option>
        ))}
      </Select>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => onPrepareInterview(app)}
          className="text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-700"
        >
          {t(lang, 'Prepare interview', '准备面试')}
        </button>
        <button
          onClick={loadHistory}
          className="text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-slate-500"
        >
          {t(lang, 'Timeline', '时间线')}
        </button>
      </div>

      {showHistory && (
        <ul className="text-[10px] text-slate-500 border-t border-slate-100 pt-3 space-y-1">
          {history === null && <li>{t(lang, 'Loading...', '加载中...')}</li>}
          {history?.length === 0 && <li>{t(lang, 'No history.', '暂无记录。')}</li>}
          {history?.map((h) => (
            <li key={h.id}>
              <span className="font-semibold">{STATUS_LABEL[h.status]?.[lang === 'zh' ? 'zh' : 'en'] || h.status}</span>
              {' · '}{new Date(h.changedAt).toLocaleDateString()}
              {h.note && <span className="text-slate-400"> — {h.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ApplicationTracker({
  userId, lang, onPrepareInterview, demo = false, onLogin,
}: ApplicationTrackerProps) {
  const [apps, setApps] = useState<ApplicationWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = () => {
    if (demo) { setApps(demoApplications); setLoading(false); return; }
    setLoading(true);
    listApplications(userId)
      .then(setApps)
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [userId, demo]);

  const handleMove = async (app: ApplicationWithJob, status: ApplicationStatus) => {
    if (demo) { onLogin?.(); return; }
    if (status === app.status) return;
    setBusyId(app.id);
    setError(null);
    try {
      const updated = await updateApplicationStatus(userId, app.id, status);
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, ...updated, job: a.job } : a)));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="p-10 text-sm font-medium text-slate-400">{t(lang, 'Loading applications...', '正在加载申请...')}</div>;
  }

  return (
    <div className="px-6 py-10 space-y-6">
      <ScreenHeading
        eyebrow={t(lang, 'Track', '追踪')}
        title={t(lang, 'Applications', 'Applications')}
        subtitle={t(lang,
          'Every application keeps the job, the match score, and the exact resume version used — so interview prep never drifts from what you sent.',
          '每份申请都保留职位、匹配分数和当时实际投出的简历版本 —— 准备面试时不会跟投出去的对不上。')}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {apps.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-sm font-bold text-slate-400">
            {t(lang, 'No applications yet.', '还没有申请。')}
          </p>
          <p className="text-xs text-slate-300 mt-1">
            {t(lang, 'Save one from the Jobs tab.', '可以在 Jobs 标签页保存一个。')}
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {COLUMNS.map((status) => {
            const inColumn = apps.filter((a) => a.status === status);
            return (
              <div key={status} className="space-y-2">
                <div className={`text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border ${STATUS_TINT[status]}`}>
                  {STATUS_LABEL[status][lang === 'zh' ? 'zh' : 'en']} ({inColumn.length})
                </div>
                {inColumn.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    lang={lang}
                    onMove={handleMove}
                    onPrepareInterview={onPrepareInterview}
                    demo={demo}
                    busy={busyId === app.id}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {apps.some((a) => a.status === 'withdrawn') && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">
            {t(lang, 'Withdrawn', '已撤回')} ({apps.filter((a) => a.status === 'withdrawn').length})
          </summary>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            {apps.filter((a) => a.status === 'withdrawn').map((app) => (
              <ApplicationCard key={app.id} app={app} lang={lang} onMove={handleMove} onPrepareInterview={onPrepareInterview} busy={busyId === app.id} demo={demo} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
