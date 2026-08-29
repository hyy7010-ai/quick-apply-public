import React, { useEffect, useState } from 'react';
import type { AnalysisResult, CanonicalJob, JobMarket, Language, MatchSnapshot, ResumeContent, TailoredResume } from '../../types';
import { createJob, listJobs } from '../../services/career/jobsService';
import { manualConnector } from '../../services/career/connectors/manualConnector';
import { generateAndSaveMatchSnapshot, listMatchSnapshots } from '../../services/career/matchService';
import { getCareerProfile } from '../../services/career/profileService';
import { generateTailoredResume, listTailoredResumes } from '../../services/career/tailoredResumeService';
import { createApplication, findExistingApplications } from '../../services/career/applicationsService';
import { demoJobs, demoTailoredResumes, getDemoSnapshots } from '../../services/career/demoData';
import { Alert, Button, Chip, Field, MicroLabel, Panel, ScreenHeading, Select } from './ui';
import { CREDIT_COSTS } from '../../credits';

interface JobsBoardProps {
  userId: string;
  lang: Language;
  /** The user's current resume from the Resume Builder, used as the source
   * for tailoring. Null if they haven't produced one yet. */
  baseResume: ResumeContent | null;
  onCheckCredits: (amount: number) => Promise<boolean>;
  onSpendCredits: (amount: number) => Promise<void>;
  /** Lets the tracker refresh after a job is saved as an application. */
  onApplicationCreated?: () => void;
  /** Opens a generated version in the existing Resume editor, where it can be
   * reviewed, edited and exported to PDF. */
  onOpenTailoredResume: (result: AnalysisResult) => void;
  /** Read-only worked example for signed-out visitors. */
  demo?: boolean;
  /** Prompts sign-in when a visitor tries an action that would cost credits
   * or write to their account. */
  onLogin?: () => void;
}

const t = (lang: Language, en: string, zh: string) => (lang === 'zh' ? zh : en);

const emptyForm = { market: 'AU' as JobMarket, title: '', company: '', descriptionText: '', location: '', sourceUrl: '' };

function ScoreBar({ label, dim }: { label: string; dim: { score: number; weight: number; notes: string } }) {
  return (
    <div>
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
          {label} <span className="text-slate-300">{Math.round(dim.weight * 100)}%</span>
        </span>
        <span className="text-sm font-black text-slate-900 tabular-nums">{Math.round(dim.score)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, dim.score))}%` }}
        />
      </div>
      {dim.notes && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{dim.notes}</p>}
    </div>
  );
}

function MatchSnapshotCard({ snapshot, lang }: { snapshot: MatchSnapshot; lang: Language }) {
  const actionTone: Record<string, 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate'> = {
    priority_apply: 'emerald', apply: 'indigo', consider: 'amber', skip: 'rose',
  };
  const actionLabel: Record<string, string> = {
    priority_apply: t(lang, 'Priority apply', '优先投递'),
    apply: t(lang, 'Apply', '建议投递'),
    consider: t(lang, 'Consider', '可以考虑'),
    skip: t(lang, 'Skip', '不建议'),
  };
  return (
    <div className="rounded-[1.75rem] border border-slate-100 p-6 space-y-5 bg-gradient-to-br from-slate-50 to-white">
      <div className="flex items-end justify-between gap-4">
        <div>
          <MicroLabel className="mb-1">{t(lang, 'Career Fit', '匹配度')}</MicroLabel>
          <span className="text-5xl font-black tracking-tighter text-slate-900 tabular-nums">
            {Math.round(snapshot.overallScore)}<span className="text-2xl text-slate-300">%</span>
          </span>
        </div>
        <Chip tone={actionTone[snapshot.recommendedAction] || 'slate'}>
          {actionLabel[snapshot.recommendedAction] || snapshot.recommendedAction}
        </Chip>
      </div>
      <div className="space-y-4">
        <ScoreBar label={t(lang, 'Hard requirements', '硬性资格')} dim={snapshot.scoreBreakdown.hardRequirements} />
        <ScoreBar label={t(lang, 'Skills & experience', '技能与经历')} dim={snapshot.scoreBreakdown.skillsExperience} />
        <ScoreBar label={t(lang, 'Goals & preferences', '目标与偏好')} dim={snapshot.scoreBreakdown.goalsPreferences} />
        <ScoreBar label={t(lang, 'Opportunity quality', '机会质量')} dim={snapshot.scoreBreakdown.opportunityQuality} />
      </div>
      {snapshot.hardGaps.length > 0 && (
        <div className="rounded-2xl bg-rose-50/60 border border-rose-100 p-4">
          <MicroLabel className="text-rose-400 mb-2">{t(lang, 'Hard gaps', '硬性缺口')}</MicroLabel>
          <ul className="space-y-1.5">
            {snapshot.hardGaps.map((g, i) => (
              <li key={i} className="text-xs font-medium text-rose-700 flex gap-2">
                <span className="text-rose-300">&bull;</span>{g}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
        {new Date(snapshot.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

export default function JobsBoard({
  userId, lang, baseResume, onCheckCredits, onSpendCredits, onApplicationCreated,
  onOpenTailoredResume, demo = false, onLogin,
}: JobsBoardProps) {
  const [jobs, setJobs] = useState<CanonicalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotsByJob, setSnapshotsByJob] = useState<Record<number, MatchSnapshot[]>>({});
  const [scoringJobId, setScoringJobId] = useState<number | null>(null);
  const [resumesByJob, setResumesByJob] = useState<Record<number, TailoredResume[]>>({});
  const [tailoringJobId, setTailoringJobId] = useState<number | null>(null);
  const [savingJobId, setSavingJobId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshJobs = () => {
    if (demo) {
      setJobs(demoJobs);
      setSnapshotsByJob(getDemoSnapshots(lang));
      setResumesByJob(demoTailoredResumes);
      setLoading(false);
      return;
    }
    setLoading(true);
    listJobs(userId)
      .then(setJobs)
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refreshJobs, [userId, demo]);

  const handleAddJob = async () => {
    setError(null);
    try {
      const input = manualConnector.normalize(form);
      const job = await createJob(userId, input);
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  const handleGenerateMatch = async (job: CanonicalJob) => {
    // In demo mode every result is already on screen; the actions exist to
    // show what is possible, not to quietly do nothing.
    if (demo) { onLogin?.(); return; }
    setError(null);
    const profile = await getCareerProfile(userId);
    if (!profile) {
      setError(t(lang, 'Complete your Career Profile before generating a match score.', '请先完成 Career Profile 再生成匹配分数。'));
      return;
    }
    if (!(await onCheckCredits(CREDIT_COSTS.jobMatchScore))) return;

    setScoringJobId(job.id);
    try {
      const snapshot = await generateAndSaveMatchSnapshot(userId, profile, job, lang);
      await onSpendCredits(CREDIT_COSTS.jobMatchScore);
      setSnapshotsByJob((prev) => ({ ...prev, [job.id]: [snapshot, ...(prev[job.id] || [])] }));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setScoringJobId(null);
    }
  };

  /** Step 8: generate a job-specific resume + cover letter from the user's
   * existing resume. Charged at the same rate as a Resume Builder run,
   * because it is the same engine doing the same work. */
  const handleTailorResume = async (job: CanonicalJob) => {
    // In demo mode every result is already on screen; the actions exist to
    // show what is possible, not to quietly do nothing.
    if (demo) { onLogin?.(); return; }
    setError(null);
    setNotice(null);
    if (!baseResume) {
      setError(t(lang,
        'Generate a resume in the Resume Builder first — tailoring rewrites your existing resume, it does not invent one.',
        '请先在 Resume Builder 生成一份简历——定制是在你已有简历基础上改写重点,不会凭空生成经历。'));
      return;
    }
    if (!(await onCheckCredits(CREDIT_COSTS.resumeOptimization))) return;

    setTailoringJobId(job.id);
    try {
      const tailored = await generateTailoredResume(userId, job, baseResume, lang);
      await onSpendCredits(CREDIT_COSTS.resumeOptimization);
      setResumesByJob((prev) => ({ ...prev, [job.id]: [tailored, ...(prev[job.id] || [])] }));
      setNotice(t(lang,
        'Opened in the editor — review it, then export a PDF from there.',
        '已在编辑器中打开 —— 检查一下,然后从那里导出 PDF。'));
      // Generating a resume the user cannot read is pointless, so go straight
      // to the editor rather than leaving them to hunt for it.
      onOpenTailoredResume(tailored.content);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setTailoringJobId(null);
    }
  };

  /** Step 9: save this job into the tracker, binding the newest match
   * snapshot and tailored resume so the application records exactly what was
   * used. */
  const handleSaveToTracker = async (job: CanonicalJob) => {
    // In demo mode every result is already on screen; the actions exist to
    // show what is possible, not to quietly do nothing.
    if (demo) { onLogin?.(); return; }
    setError(null);
    setNotice(null);
    setSavingJobId(job.id);
    try {
      const existing = await findExistingApplications(userId, job.id);
      if (existing.length > 0) {
        const proceed = window.confirm(t(lang,
          `You already have an active application for this job (status: ${existing[0].status}). Create another one anyway?`,
          `你已经有一份该职位的申请(状态:${existing[0].status})。仍要再创建一份吗?`));
        if (!proceed) return;
      }

      const snapshot = (snapshotsByJob[job.id] || [])[0];
      const tailored = (resumesByJob[job.id] || [])[0];

      await createApplication(userId, {
        jobId: job.id,
        matchSnapshotId: snapshot?.id,
        tailoredResumeId: tailored?.id,
      });
      setNotice(t(lang, 'Saved to Applications.', '已保存到 Applications。'));
      onApplicationCreated?.();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSavingJobId(null);
    }
  };

  const loadHistory = async (jobId: number) => {
    if (!resumesByJob[jobId]) {
      listTailoredResumes(userId, jobId)
        .then((r) => setResumesByJob((prev) => ({ ...prev, [jobId]: r })))
        .catch(() => undefined);
    }
    if (snapshotsByJob[jobId]) return;
    const snapshots = await listMatchSnapshots(userId, jobId);
    setSnapshotsByJob((prev) => ({ ...prev, [jobId]: snapshots }));
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <ScreenHeading
        eyebrow={t(lang, 'Discover', '发现')}
        title={t(lang, 'Jobs', 'Jobs')}
        subtitle={t(lang,
          'Paste a job you found and see how well it actually fits — with the reasoning, not just a number.',
          '粘贴你看到的职位,看它到底适不适合你 —— 给你理由,不只是一个数字。')}
        action={
          <Button variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((s) => !s)}>
            {showForm ? t(lang, 'Cancel', '取消') : t(lang, '+ Add job', '+ 添加职位')}
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {showForm && (
        <Panel className="p-8 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <MicroLabel>{t(lang, 'Market', '市场')}</MicroLabel>
              <Select
                value={form.market}
                onChange={(e) => setForm((f) => ({ ...f, market: e.target.value as JobMarket }))}
              >
                <option value="AU">AU</option>
                <option value="CN">CN</option>
              </Select>
            </label>
            <label className="block col-span-2">
              <MicroLabel>{t(lang, 'Job URL (optional)', '职位链接(可选)')}</MicroLabel>
              <Field
                type="text"
                value={form.sourceUrl}
                onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <MicroLabel>{t(lang, 'Title', '职位名称')}</MicroLabel>
              <Field
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block">
              <MicroLabel>{t(lang, 'Company', '公司')}</MicroLabel>
              <Field
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <MicroLabel>{t(lang, 'Location', '地点')}</MicroLabel>
            <Field
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </label>
          <label className="block">
            <MicroLabel>{t(lang, 'Job description', '职位描述')}</MicroLabel>
            <textarea
              rows={8}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium placeholder:text-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 focus:outline-none transition-all"
              value={form.descriptionText}
              onChange={(e) => setForm((f) => ({ ...f, descriptionText: e.target.value }))}
            />
          </label>
          <Button
            onClick={handleAddJob}
            disabled={!form.title || !form.company || !form.descriptionText}
          >
            {t(lang, 'Save job', '保存职位')}
          </Button>
        </Panel>
      )}

      {loading ? (
        <p className="text-sm font-medium text-slate-400">{t(lang, 'Loading jobs...', '正在加载职位...')}</p>
      ) : jobs.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-sm font-bold text-slate-400">{t(lang, 'No jobs yet.', '还没有职位。')}</p>
          <p className="text-xs text-slate-300 mt-1">{t(lang, 'Add one to see how well it fits.', '添加一个看看匹配度。')}</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Panel key={job.id} className="p-7">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h3 className="text-xl font-black tracking-tight text-slate-900">{job.title}</h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">{job.company}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {job.location && <Chip tone="slate">{job.location}</Chip>}
                    <Chip tone="indigo">{job.market}</Chip>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 shrink-0 w-48">
                  <Button
                    size="sm"
                    onClick={() => handleGenerateMatch(job)}
                    disabled={scoringJobId === job.id}
                  >
                    {scoringJobId === job.id
                      ? t(lang, 'Scoring...', '打分中...')
                      : t(lang, `Match score · ${CREDIT_COSTS.jobMatchScore}`, `匹配打分 · ${CREDIT_COSTS.jobMatchScore}`)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleTailorResume(job)}
                    disabled={tailoringJobId === job.id}
                  >
                    {tailoringJobId === job.id
                      ? t(lang, 'Tailoring...', '定制中...')
                      : t(lang, `Tailor resume · ${CREDIT_COSTS.resumeOptimization}`, `定制简历 · ${CREDIT_COSTS.resumeOptimization}`)}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSaveToTracker(job)}
                    disabled={savingJobId === job.id}
                  >
                    {savingJobId === job.id
                      ? t(lang, 'Saving...', '保存中...')
                      : t(lang, 'Save to Applications', '保存到 Applications')}
                  </Button>
                </div>
              </div>

              {(resumesByJob[job.id] || []).length > 0 && (
                <div className="mt-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 p-4">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3">
                    {t(lang, 'Tailored versions', '定制版本')} ({resumesByJob[job.id].length})
                  </p>
                  <div className="space-y-2">
                    {resumesByJob[job.id].map((r, i) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white border border-emerald-100 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900">
                            {t(lang, `Version ${resumesByJob[job.id].length - i}`, `第 ${resumesByJob[job.id].length - i} 版`)}
                            {typeof r.content?.overallScore === 'number' && (
                              <span className="ml-2 text-emerald-600">ATS {Math.round(r.content.overallScore)}%</span>
                            )}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mt-0.5">
                            {new Date(r.createdAt).toLocaleString()}
                            {r.coverLetter ? ` · ${t(lang, 'with cover letter', '含求职信')}` : ''}
                          </p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => onOpenTailoredResume(r.content)}>
                          {t(lang, 'Open', '打开')}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-emerald-600/70 mt-3 leading-relaxed">
                    {t(lang,
                      'Opening a version loads it into the Resume editor, where you can edit it and export a PDF.',
                      '打开后会载入简历编辑器,可以继续编辑并导出 PDF。')}
                  </p>
                </div>
              )}

              <div className="mt-3">
                {(snapshotsByJob[job.id] || []).length === 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => loadHistory(job.id)}>
                    {t(lang, 'Show past scores', '查看历史打分')}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    {(snapshotsByJob[job.id] || []).map((s) => (
                      <MatchSnapshotCard key={s.id} snapshot={s} lang={lang} />
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
