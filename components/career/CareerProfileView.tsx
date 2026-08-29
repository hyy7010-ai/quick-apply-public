import React, { useEffect, useRef, useState } from 'react';
import type { AgeBand, CareerProfile, CareerProfileInput, GenderOption, Language } from '../../types';
import { getCareerProfile, upsertCareerProfile } from '../../services/career/profileService';
import { importProfileFromResume } from '../../services/career/profileImportService';
import ProfileWizard from './ProfileWizard';
import { demoProfile } from '../../services/career/demoData';
import { Alert, Button, Field, MicroLabel, Panel, ScreenHeading, Select } from './ui';
import { CREDIT_COSTS } from '../../credits';

interface CareerProfileViewProps {
  userId: string;
  lang: Language;
  /** Read-only worked example for signed-out visitors. Nothing is fetched or
   * saved while this is on. */
  demo?: boolean;
  onCheckCredits: (amount: number) => Promise<boolean>;
  onSpendCredits: (amount: number) => Promise<void>;
}

const emptyInput: CareerProfileInput = {
  fullName: '',
  headline: '',
  targetTitles: [],
  targetLocations: [],
  targetIndustries: [],
  seniority: '',
  workRights: '',
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: '',
  remotePreference: undefined,
  languages: [],
  derivedSkills: [],
  confirmedFacts: [],
  workHistory: [],
  education: [],
  certifications: [],
  optionalDemographics: {},
  savedAnswers: [],
};

const AGE_BANDS: AgeBand[] = ['18-24', '25-34', '35-44', '45-54', '55+'];

const t = (lang: Language, en: string, zh: string) => (lang === 'zh' ? zh : en);

/** Comma-separated text field bound to a string[] value. */
function ListField({ label, value, onChange, placeholder }: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <MicroLabel>{label}</MicroLabel>
      <Field
        type="text"
        placeholder={placeholder}
        defaultValue={value.join(', ')}
        onBlur={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
      />
    </label>
  );
}

export default function CareerProfileView({ userId, lang, demo = false, onCheckCredits, onSpendCredits }: CareerProfileViewProps) {
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [form, setForm] = useState<CareerProfileInput>(emptyInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** null until the profile has loaded and we know which view to show. */
  const [mode, setMode] = useState<'wizard' | 'form' | null>(null);

  useEffect(() => {
    if (demo) {
      const { userId: _u, updatedAt: _a, ...rest } = demoProfile;
      setProfile(demoProfile);
      setForm(rest);
      setMode('form');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCareerProfile(userId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) {
          const { userId: _u, updatedAt: _a, ...rest } = p;
          setForm(rest);
        }
        // Guided setup is for people who have nothing yet. Anyone with a
        // usable profile goes straight to the editable form — being walked
        // through five steps again just to fix a typo would be worse UX than
        // the form we are replacing.
        const isSetUp = !!p && p.targetTitles.length > 0;
        setMode(isSetUp ? 'form' : 'wizard');
      })
      .catch((e) => !cancelled && setError(e.message || String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userId, demo]);

  const update = <K extends keyof CareerProfileInput>(key: K, value: CareerProfileInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertCareerProfile(userId, form);
      setProfile(saved);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Import from a resume file. Everything extracted lands as UNCONFIRMED —
   * the user reviews it below and ticks what is true before it counts as a
   * fact the agent may use.
   */
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting the same file
    setError(null);
    setImportNotice(null);

    if (!(await onCheckCredits(CREDIT_COSTS.profileImport))) return;

    setImporting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });

      const imported = await importProfileFromResume(
        { mimeType: file.type || 'application/pdf', data: base64 },
        lang
      );
      await onSpendCredits(CREDIT_COSTS.profileImport);

      // Merge, never clobber: anything the user already typed wins.
      setForm((f) => ({
        ...f,
        fullName: f.fullName || imported.fullName || '',
        headline: f.headline || imported.headline || '',
        seniority: f.seniority || imported.seniority || '',
        email: f.email || imported.email || '',
        phone: f.phone || imported.phone || '',
        city: f.city || imported.city || '',
        country: f.country || imported.country || '',
        linkedinUrl: f.linkedinUrl || imported.linkedinUrl || '',
        websiteUrl: f.websiteUrl || imported.websiteUrl || '',
        languages: f.languages.length ? f.languages : imported.languages,
        certifications: f.certifications.length ? f.certifications : imported.certifications,
        derivedSkills: imported.derivedSkills,
        workHistory: [...f.workHistory, ...imported.workHistory],
        education: [...f.education, ...imported.education],
        importedFromResumeAt: new Date().toISOString(),
      }));

      setImportNotice(t(lang,
        `Imported ${imported.workHistory.length} roles and ${imported.education.length} education entries. Please review and confirm each one below — nothing is used until you confirm it.`,
        `已导入 ${imported.workHistory.length} 段工作经历和 ${imported.education.length} 条教育经历。请在下方逐条核对并确认 —— 未确认的内容不会被使用。`));
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setImporting(false);
    }
  };

  const toggleWorkConfirmed = (id: string) => {
    setForm((f) => ({
      ...f,
      workHistory: f.workHistory.map((w) => (w.id === id ? { ...w, confirmed: !w.confirmed } : w)),
    }));
  };
  const removeWork = (id: string) =>
    setForm((f) => ({ ...f, workHistory: f.workHistory.filter((w) => w.id !== id) }));

  const toggleEduConfirmed = (id: string) => {
    setForm((f) => ({
      ...f,
      education: f.education.map((x) => (x.id === id ? { ...x, confirmed: !x.confirmed } : x)),
    }));
  };
  const removeEdu = (id: string) =>
    setForm((f) => ({ ...f, education: f.education.filter((x) => x.id !== id) }));

  if (loading || mode === null) {
    return <div className="p-10 text-sm font-medium text-slate-400">{t(lang, 'Loading profile...', '正在加载资料...')}</div>;
  }

  if (mode === 'wizard') {
    return (
      <>
        {error && (
          <div className="max-w-xl mx-auto mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
            {error}
          </div>
        )}
        <ProfileWizard
          lang={lang}
          initial={form}
          saving={saving}
          onCheckCredits={onCheckCredits}
          onSpendCredits={onSpendCredits}
          onSkipToForm={() => setMode('form')}
          onComplete={async (completed) => {
            setForm(completed);
            setSaving(true);
            setError(null);
            try {
              const saved = await upsertCareerProfile(userId, completed);
              setProfile(saved);
              setSavedAt(Date.now());
              setMode('form');
            } catch (e: any) {
              setError(e.message || String(e));
            } finally {
              setSaving(false);
            }
          }}
        />
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <ScreenHeading
        eyebrow={t(lang, 'Your profile', '个人资料')}
        title={t(lang, 'Career Profile', 'Career Profile')}
        subtitle={t(lang,
          'This is what Career Fit scoring and job matching are based on.',
          '职位匹配和 Career Fit 打分都基于这份资料。')}
        action={
          <Button variant="secondary" size="sm" onClick={() => setMode('wizard')}>
            {t(lang, 'Guided setup', '引导式设置')}
          </Button>
        }
      />
      <Panel className="p-8 space-y-6">

      {error && <Alert tone="error">{error}</Alert>}
      {importNotice && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">{importNotice}</div>}

      {/* Resume import — strategy doc Step 1: upload or fill in by hand. */}
      <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-4">
        <p className="text-sm font-bold text-slate-800">
          {t(lang, 'Start from your resume', '从简历开始')}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {t(lang,
            'Upload a resume and we will fill this in for you. Everything extracted stays unconfirmed until you review it.',
            '上传简历,我们帮你自动填好。提取出来的内容在你核对确认前不会被使用。')}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={handleResumeUpload}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {importing
            ? t(lang, 'Reading your resume...', '正在读取简历...')
            : t(lang, `Upload resume (${CREDIT_COSTS.profileImport} credit)`, `上传简历(${CREDIT_COSTS.profileImport} 积分)`)}
        </button>
        {form.importedFromResumeAt && (
          <p className="text-[10px] text-slate-400 mt-2">
            {t(lang, 'Last imported', '上次导入')}: {new Date(form.importedFromResumeAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <MicroLabel>{t(lang, 'Full name', '姓名')}</MicroLabel>
          <Field
            type="text"
            value={form.fullName || ''}
            onChange={(e) => update('fullName', e.target.value)}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Headline', '一句话定位')}</MicroLabel>
          <Field
            type="text"
            value={form.headline || ''}
            onChange={(e) => update('headline', e.target.value)}
          />
        </label>
      </div>

      {/* Contact details. These go on the resume and are what the browser
          extension types into application forms, so it never has to guess. */}
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <MicroLabel>{t(lang, 'Email', '邮箱')}</MicroLabel>
          <Field
            type="email"
            placeholder="you@example.com"
            value={form.email || ''}
            onChange={(e) => update('email', e.target.value)}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Phone', '电话')}</MicroLabel>
          <Field
            type="tel"
            placeholder="+61 4XX XXX XXX"
            value={form.phone || ''}
            onChange={(e) => update('phone', e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <MicroLabel>{t(lang, 'City', '城市')}</MicroLabel>
          <Field
            type="text"
            value={form.city || ''}
            onChange={(e) => update('city', e.target.value)}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Country', '国家')}</MicroLabel>
          <Field
            type="text"
            value={form.country || ''}
            onChange={(e) => update('country', e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <MicroLabel>LinkedIn</MicroLabel>
          <Field
            type="url"
            placeholder="https://linkedin.com/in/..."
            value={form.linkedinUrl || ''}
            onChange={(e) => update('linkedinUrl', e.target.value)}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Portfolio / GitHub', '作品集 / GitHub')}</MicroLabel>
          <Field
            type="url"
            placeholder="https://..."
            value={form.websiteUrl || ''}
            onChange={(e) => update('websiteUrl', e.target.value)}
          />
        </label>
      </div>

      <ListField
        label={t(lang, 'Target titles (comma-separated)', '目标职位(逗号分隔)')}
        value={form.targetTitles}
        onChange={(v) => update('targetTitles', v)}
        placeholder="Software Engineer, Product Analyst"
      />
      <ListField
        label={t(lang, 'Target locations (comma-separated)', '目标地点(逗号分隔)')}
        value={form.targetLocations}
        onChange={(v) => update('targetLocations', v)}
        placeholder="Melbourne, Sydney"
      />
      <ListField
        label={t(lang, 'Target industries (comma-separated)', '目标行业(逗号分隔)')}
        value={form.targetIndustries}
        onChange={(v) => update('targetIndustries', v)}
      />

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <MicroLabel>{t(lang, 'Seniority', '资历级别')}</MicroLabel>
          <Field
            type="text"
            value={form.seniority || ''}
            onChange={(e) => update('seniority', e.target.value)}
            placeholder={t(lang, 'e.g. Graduate, Mid, Senior', '如：应届/中级/资深')}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Work rights', '工作权利')}</MicroLabel>
          <Field
            type="text"
            value={form.workRights || ''}
            onChange={(e) => update('workRights', e.target.value)}
            placeholder={t(lang, 'e.g. Citizen, PR, Student visa 485', '如：公民/PR/485签证')}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="block">
          <MicroLabel>{t(lang, 'Salary min', '期望最低薪资')}</MicroLabel>
          <Field
            type="number"
            value={form.salaryMin ?? ''}
            onChange={(e) => update('salaryMin', e.target.value ? Number(e.target.value) : undefined)}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Salary max', '期望最高薪资')}</MicroLabel>
          <Field
            type="number"
            value={form.salaryMax ?? ''}
            onChange={(e) => update('salaryMax', e.target.value ? Number(e.target.value) : undefined)}
          />
        </label>
        <label className="block">
          <MicroLabel>{t(lang, 'Currency', '货币')}</MicroLabel>
          <Field
            type="text"
            value={form.salaryCurrency || ''}
            onChange={(e) => update('salaryCurrency', e.target.value)}
            placeholder="AUD / CNY"
          />
        </label>
      </div>

      <label className="block">
        <MicroLabel>{t(lang, 'Remote preference', '远程偏好')}</MicroLabel>
        <Select
          value={form.remotePreference || ''}
          onChange={(e) => update('remotePreference', (e.target.value || undefined) as CareerProfileInput['remotePreference'])}
        >
          <option value="">{t(lang, 'Not specified', '未指定')}</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
          <option value="flexible">Flexible</option>
        </Select>
      </label>

      <ListField
        label={t(lang, 'Languages (comma-separated)', '语言(逗号分隔)')}
        value={form.languages}
        onChange={(v) => update('languages', v)}
        placeholder="English, Mandarin"
      />

      <ListField
        label={t(lang, 'Certifications (comma-separated)', '证书(逗号分隔)')}
        value={form.certifications}
        onChange={(v) => update('certifications', v)}
      />

      {/* Work history — the fact whitelist. Unconfirmed entries are visibly
          marked, because generation is only allowed to rely on confirmed ones. */}
      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800">{t(lang, 'Work experience', '工作经历')}</h3>
          <button
            onClick={() => setForm((f) => ({
              ...f,
              workHistory: [...f.workHistory, { id: `wh-${Date.now()}`, role: '', company: '', confirmed: true }],
            }))}
            className="text-xs font-bold text-indigo-600"
          >
            {t(lang, '+ Add manually', '+ 手动添加')}
          </button>
        </div>

        {form.workHistory.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">
            {t(lang, 'None yet — upload a resume above or add one manually.', '还没有 —— 可以上传简历或手动添加。')}
          </p>
        ) : (
          <div className="space-y-3 mt-3">
            {form.workHistory.map((w) => (
              <div
                key={w.id}
                className={`rounded-lg border p-3 ${w.confirmed ? 'border-slate-200' : 'border-amber-300 bg-amber-50/50'}`}
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'Role', '职位')}
                    value={w.role}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      workHistory: f.workHistory.map((x) => x.id === w.id ? { ...x, role: e.target.value } : x),
                    }))}
                  />
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'Company', '公司')}
                    value={w.company}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      workHistory: f.workHistory.map((x) => x.id === w.id ? { ...x, company: e.target.value } : x),
                    }))}
                  />
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'Start (e.g. 2023-01)', '开始(如 2023-01)')}
                    value={w.startDate || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      workHistory: f.workHistory.map((x) => x.id === w.id ? { ...x, startDate: e.target.value } : x),
                    }))}
                  />
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'End (or Present)', '结束(或至今)')}
                    value={w.endDate || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      workHistory: f.workHistory.map((x) => x.id === w.id ? { ...x, endDate: e.target.value } : x),
                    }))}
                  />
                </div>
                <textarea
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder={t(lang, 'What you did there', '在这段经历中做了什么')}
                  value={w.summary || ''}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    workHistory: f.workHistory.map((x) => x.id === w.id ? { ...x, summary: e.target.value } : x),
                  }))}
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={w.confirmed} onChange={() => toggleWorkConfirmed(w.id)} />
                    <span className={w.confirmed ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                      {w.confirmed
                        ? t(lang, 'Confirmed — usable', '已确认 —— 可使用')
                        : t(lang, 'Needs your confirmation', '待你确认')}
                    </span>
                  </label>
                  <button onClick={() => removeWork(w.id)} className="text-xs text-rose-500">
                    {t(lang, 'Remove', '删除')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Education */}
      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800">{t(lang, 'Education', '教育经历')}</h3>
          <button
            onClick={() => setForm((f) => ({
              ...f,
              education: [...f.education, { id: `ed-${Date.now()}`, school: '', confirmed: true }],
            }))}
            className="text-xs font-bold text-indigo-600"
          >
            {t(lang, '+ Add manually', '+ 手动添加')}
          </button>
        </div>

        {form.education.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">{t(lang, 'None yet.', '还没有。')}</p>
        ) : (
          <div className="space-y-3 mt-3">
            {form.education.map((ed) => (
              <div
                key={ed.id}
                className={`rounded-lg border p-3 ${ed.confirmed ? 'border-slate-200' : 'border-amber-300 bg-amber-50/50'}`}
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'School', '学校')}
                    value={ed.school}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      education: f.education.map((x) => x.id === ed.id ? { ...x, school: e.target.value } : x),
                    }))}
                  />
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'Degree', '学位')}
                    value={ed.degree || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      education: f.education.map((x) => x.id === ed.id ? { ...x, degree: e.target.value } : x),
                    }))}
                  />
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'Field of study', '专业')}
                    value={ed.field || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      education: f.education.map((x) => x.id === ed.id ? { ...x, field: e.target.value } : x),
                    }))}
                  />
                  <input
                    type="text"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder={t(lang, 'Graduated', '毕业时间')}
                    value={ed.endDate || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      education: f.education.map((x) => x.id === ed.id ? { ...x, endDate: e.target.value } : x),
                    }))}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={ed.confirmed} onChange={() => toggleEduConfirmed(ed.id)} />
                    <span className={ed.confirmed ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                      {ed.confirmed
                        ? t(lang, 'Confirmed — usable', '已确认 —— 可使用')
                        : t(lang, 'Needs your confirmation', '待你确认')}
                    </span>
                  </label>
                  <button onClick={() => removeEdu(ed.id)} className="text-xs text-rose-500">
                    {t(lang, 'Remove', '删除')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills extracted from the resume, shown with provenance so the user
          can see why we think they have each one. */}
      {form.derivedSkills.length > 0 && (
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-sm font-black text-slate-800">{t(lang, 'Skills from your resume', '从简历提取的技能')}</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.derivedSkills.map((s, i) => (
              <span
                key={i}
                title={s.source}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${
                  s.confidence === 'high' ? 'bg-emerald-50 text-emerald-700'
                  : s.confidence === 'medium' ? 'bg-sky-50 text-sky-700'
                  : 'bg-slate-100 text-slate-500'
                }`}
              >
                {s.name}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            {t(lang, 'Colour shows confidence. Hover to see where each came from.',
                     '颜色代表置信度,鼠标悬停可看来源。')}
          </p>
        </div>
      )}

      {/* Optional demographics.
          Excluded from match scoring by design — see OptionalDemographics in
          types.ts and the note on generateJobMatchScore. */}
      <div className="border-t border-slate-100 pt-5">
        <h3 className="text-sm font-black text-slate-800">
          {t(lang, 'Optional details', '选填信息')}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          {t(lang,
            'Only used for Chinese-market resume formats and filling in application forms. Never used to score or rank you against a job. Leave blank if you prefer.',
            '仅用于中国市场的简历格式和申请表填写,不会参与职位匹配打分或排序。不想填可以留空。')}
        </p>

        <div className="grid grid-cols-2 gap-4 mt-3">
          <label className="block">
            <MicroLabel>{t(lang, 'Age range', '年龄段')}</MicroLabel>
            <Select
              value={form.optionalDemographics.ageBand || ''}
              onChange={(e) => update('optionalDemographics', {
                ...form.optionalDemographics,
                ageBand: (e.target.value || undefined) as AgeBand | undefined,
              })}
            >
              <option value="">{t(lang, 'Prefer not to say', '不想说')}</option>
              {AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </label>

          <label className="block">
            <MicroLabel>{t(lang, 'Gender', '性别')}</MicroLabel>
            <Select
              value={form.optionalDemographics.gender || ''}
              onChange={(e) => update('optionalDemographics', {
                ...form.optionalDemographics,
                gender: (e.target.value || undefined) as GenderOption | undefined,
              })}
            >
              <option value="">{t(lang, 'Prefer not to say', '不想说')}</option>
              <option value="female">{t(lang, 'Female', '女')}</option>
              <option value="male">{t(lang, 'Male', '男')}</option>
              <option value="self-described">{t(lang, 'Self-described', '自述')}</option>
            </Select>
          </label>
        </div>

        {form.optionalDemographics.gender === 'self-described' && (
          <input
            type="text"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder={t(lang, 'How you describe it', '你希望如何表述')}
            value={form.optionalDemographics.genderSelfDescribed || ''}
            onChange={(e) => update('optionalDemographics', {
              ...form.optionalDemographics,
              genderSelfDescribed: e.target.value,
            })}
          />
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t(lang, 'Saving...', '保存中...') : t(lang, 'Save profile', '保存资料')}
        </Button>
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{t(lang, 'Saved', '已保存')}</span>
        )}
        {profile?.updatedAt && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
            {t(lang, 'Last updated', '上次更新')}: {new Date(profile.updatedAt).toLocaleString()}
          </span>
        )}
        </div>
      </Panel>
    </div>
  );
}
