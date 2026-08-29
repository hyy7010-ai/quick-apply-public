import React, { useRef, useState } from 'react';
import type { AgeBand, CareerProfileInput, GenderOption, Language } from '../../types';
import { importProfileFromResume } from '../../services/career/profileImportService';
import { Alert, Button, Chip, Field, MicroLabel, Panel, Select } from './ui';
import { CREDIT_COSTS } from '../../credits';

interface ProfileWizardProps {
  lang: Language;
  /** Existing values, if the user is re-running setup. */
  initial: CareerProfileInput;
  saving: boolean;
  onCheckCredits: (amount: number) => Promise<boolean>;
  onSpendCredits: (amount: number) => Promise<void>;
  onComplete: (profile: CareerProfileInput) => void;
  onSkipToForm: () => void;
}

const t = (lang: Language, en: string, zh: string) => (lang === 'zh' ? zh : en);
const AGE_BANDS: AgeBand[] = ['18-24', '25-34', '35-44', '45-54', '55+'];

/**
 * First-run Career Profile setup, asked one question at a time.
 *
 * The split between steps is not cosmetic: a resume tells us who someone HAS
 * been (history, skills, education) but never what they WANT next. So the
 * resume import fills the first half, and the remaining steps ask only for
 * what no document can supply — targets, salary, work rights, preferences.
 * Anything the import already answered is pre-filled rather than asked again.
 */
export default function ProfileWizard({
  lang, initial, saving, onCheckCredits, onSpendCredits, onComplete, onSkipToForm,
}: ProfileWizardProps) {
  const [step, setStep] = useState(0);
  /** Which of the two entry paths the user took. "Fill it in myself" skips the
   * upload and the confirm-what-we-read steps, so counting progress out of a
   * fixed six made that path jump from 1/6 straight to 4/6. Progress is
   * counted along the route actually being walked. */
  const [path, setPath] = useState<'upload' | 'manual'>('upload');
  const [form, setForm] = useState<CareerProfileInput>(initial);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<{ roles: number; edu: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const route = path === 'manual' ? [0, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  const pos = Math.max(0, route.indexOf(step));
  const prev = () => route[Math.max(0, pos - 1)];

  const set = <K extends keyof CareerProfileInput>(k: K, v: CareerProfileInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const parseList = (s: string) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);

  // ---- Step 1: resume upload -----------------------------------------------
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportError(null);

    if (!(await onCheckCredits(CREDIT_COSTS.profileImport))) return;

    setImporting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error(t(lang, 'Could not read that file.', '无法读取该文件。')));
        r.readAsDataURL(file);
      });

      const imported = await importProfileFromResume(
        { mimeType: file.type || 'application/pdf', data: base64 },
        lang
      );
      await onSpendCredits(CREDIT_COSTS.profileImport);

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
      setImportedCount({ roles: imported.workHistory.length, edu: imported.education.length });
      setStep(2); // straight to review
    } catch (err: any) {
      setImportError(err.message || String(err));
    } finally {
      setImporting(false);
    }
  };

  const confirmAll = (on: boolean) =>
    setForm((f) => ({
      ...f,
      workHistory: f.workHistory.map((w) => ({ ...w, confirmed: on })),
      education: f.education.map((x) => ({ ...x, confirmed: on })),
    }));

  /* A single narrow centred column reads as a tablet form on a desktop screen.
     Two columns give the width something to do: what this step is for stays on
     the left while the fields sit on the right. Below lg it stacks back into
     the original single column. */
  const shell = (title: string, subtitle: string, body: React.ReactNode, footer: React.ReactNode) => (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <Panel decorated className="p-8 lg:p-12">
        <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-8 lg:gap-16">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-7">
              {route.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                    i < pos ? 'bg-indigo-600' : i === pos ? 'bg-indigo-400' : 'bg-slate-100'
                  }`}
                />
              ))}
            </div>
            <MicroLabel>
              {t(lang,
                 `Step ${pos + 1} of ${route.length}`,
                 `第 ${pos + 1} / ${route.length} 步`)}
            </MicroLabel>
            <h2 className="text-3xl lg:text-[2.5rem] font-black tracking-tight text-slate-900 leading-[1.12]">{title}</h2>
            <p className="text-sm text-slate-500 mt-4 leading-relaxed">{subtitle}</p>
          </div>

          <div className="min-w-0">
            {body}
            <div className="mt-10 flex items-center gap-4 flex-wrap">{footer}</div>
          </div>
        </div>
      </Panel>
    </div>
  );

  const backBtn = (to: number) => (
    <Button variant="ghost" size="sm" onClick={() => setStep(to)}>
      {t(lang, '\u2190 Back', '\u2190 上一步')}
    </Button>
  );
  const nextBtn = (to: number, label?: string, disabled = false) => (
    <Button onClick={() => setStep(to)} disabled={disabled}>
      {label ?? t(lang, 'Continue', '继续')}
    </Button>
  );

  /** `focus` only on the first field of a step — autofocusing every input made
   * the last one win, dropping the caret at the bottom of the form. */
  const input = (
    value: string,
    onChange: (v: string) => void,
    placeholder?: string,
    focus = false
  ) => (
    <Field
      type="text"
      autoFocus={focus}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  const label = (s: string) => <MicroLabel>{s}</MicroLabel>;

  // ---- Step 0: how do you want to start? -----------------------------------
  if (step === 0) {
    return shell(
      t(lang, 'Let\'s build your Career Profile', '先来建立你的 Career Profile'),
      t(lang,
        'This is what every job match and tailored resume is based on. Two ways to start:',
        '之后所有的职位匹配和定制简历都基于这份资料。有两种开始方式:'),
      <div className="space-y-4">
        <button
          onClick={() => { setPath('upload'); setStep(1); }}
          className="group w-full text-left rounded-[1.75rem] border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-6 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-100 hover:-translate-y-0.5 transition-all duration-300"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-black text-slate-900">{t(lang, 'Upload my resume', '上传我的简历')}</p>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                {t(lang,
                  'We read your experience, education and skills. You confirm what is right — nothing is used until you do.',
                  '我们帮你读出工作经历、教育和技能。你核对确认后才会被使用。')}
              </p>
            </div>
            <span className="shrink-0 text-2xl opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all">&rarr;</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Chip tone="indigo">{t(lang, 'Fastest', '最快')}</Chip>
            <Chip tone="slate">
              {t(lang, `${CREDIT_COSTS.profileImport} credit`, `${CREDIT_COSTS.profileImport} 积分`)}
            </Chip>
          </div>
        </button>

        <button
          onClick={() => { setPath('manual'); setStep(3); }}
          className="group w-full text-left rounded-[1.75rem] border border-slate-150 bg-white p-6 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-black text-slate-900">{t(lang, 'Fill it in myself', '我自己填')}</p>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                {t(lang, 'No resume handy — answer a few questions instead.', '手边没有简历 —— 回答几个问题就行。')}
              </p>
            </div>
            <span className="shrink-0 text-2xl opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all">&rarr;</span>
          </div>
          <div className="mt-4"><Chip tone="slate">{t(lang, 'Free', '免费')}</Chip></div>
        </button>
      </div>,
      <Button variant="ghost" size="sm" onClick={onSkipToForm}>
        {t(lang, 'Skip — show me the full form', '跳过 —— 直接看完整表单')}
      </Button>
    );
  }

  // ---- Step 1: upload ------------------------------------------------------
  if (step === 1) {
    return shell(
      t(lang, 'Upload your resume', '上传你的简历'),
      t(lang, 'PDF, Word or plain text. We only read what it actually says — nothing is invented.',
               'PDF、Word 或纯文本。我们只读简历里真实写了的内容,不会替你编造。'),
      <div>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="w-full rounded-[1.75rem] border-2 border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white py-14 text-center hover:border-indigo-400 hover:from-indigo-50 transition-all duration-300 disabled:opacity-60"
        >
          <p className="text-lg font-black text-slate-900">
            {importing ? t(lang, 'Reading your resume...', '正在读取简历...') : t(lang, 'Choose a file', '选择文件')}
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
            {importing ? t(lang, 'This takes a few seconds', '需要几秒钟') : 'PDF / DOC / DOCX / TXT'}
          </p>
        </button>
        {importError && <div className="mt-4"><Alert tone="error">{importError}</Alert></div>}
      </div>,
      <>
        {backBtn(prev())}
        <button onClick={() => { setPath('manual'); setStep(3); }} className="text-sm font-semibold text-slate-400 hover:text-slate-600 ml-auto">
          {t(lang, 'I\'ll type it instead', '我还是自己填')}
        </button>
      </>
    );
  }

  // ---- Step 2: review what we extracted ------------------------------------
  if (step === 2) {
    const unconfirmed =
      form.workHistory.filter((w) => !w.confirmed).length + form.education.filter((e) => !e.confirmed).length;

    return shell(
      t(lang, 'Does this look right?', '这些对吗?'),
      t(lang,
        `We read ${importedCount?.roles ?? form.workHistory.length} roles and ${importedCount?.edu ?? form.education.length} education entries. Untick anything that is wrong — we only use what you confirm.`,
        `读到了 ${importedCount?.roles ?? form.workHistory.length} 段工作经历和 ${importedCount?.edu ?? form.education.length} 条教育经历。不对的取消勾选 —— 只有你确认的才会被使用。`),
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => confirmAll(true)}>
            {t(lang, 'Confirm all', '全部确认')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => confirmAll(false)}>
            {t(lang, 'Untick all', '全部取消')}
          </Button>
        </div>

        {form.workHistory.map((w) => (
          <label
            key={w.id}
            className={`flex gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${w.confirmed ? 'border-emerald-200 bg-emerald-50/50 shadow-sm shadow-emerald-100' : 'border-slate-150 bg-white hover:border-slate-300'}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={w.confirmed}
              onChange={() => setForm((f) => ({
                ...f,
                workHistory: f.workHistory.map((x) => x.id === w.id ? { ...x, confirmed: !x.confirmed } : x),
              }))}
            />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">{w.role || t(lang, '(no role)', '(无职位)')}</p>
              <p className="text-xs text-slate-500">
                {w.company}{w.startDate ? ` · ${w.startDate} – ${w.endDate || t(lang, 'Present', '至今')}` : ''}
              </p>
              {w.summary && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{w.summary}</p>}
            </div>
          </label>
        ))}

        {form.education.map((ed) => (
          <label
            key={ed.id}
            className={`flex gap-3 rounded-2xl border p-4 cursor-pointer transition-all ${ed.confirmed ? 'border-emerald-200 bg-emerald-50/50 shadow-sm shadow-emerald-100' : 'border-slate-150 bg-white hover:border-slate-300'}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={ed.confirmed}
              onChange={() => setForm((f) => ({
                ...f,
                education: f.education.map((x) => x.id === ed.id ? { ...x, confirmed: !x.confirmed } : x),
              }))}
            />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">{ed.school}</p>
              <p className="text-xs text-slate-500">
                {[ed.degree, ed.field, ed.endDate].filter(Boolean).join(' · ')}
              </p>
            </div>
          </label>
        ))}

        {form.derivedSkills.length > 0 && (
          <div>
            {label(t(lang, 'Skills we found', '读到的技能'))}
            <div className="flex flex-wrap gap-1.5">
              {form.derivedSkills.map((s, i) => (
                <span key={i} title={s.source} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 text-xs font-bold">
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {unconfirmed > 0 && (
          <p className="text-xs font-bold text-amber-700">
            {t(lang, `${unconfirmed} item(s) still unticked — those will not be used.`,
                     `还有 ${unconfirmed} 条未勾选 —— 这些不会被使用。`)}
          </p>
        )}
      </div>,
      <>
        {backBtn(prev())}
        {nextBtn(3)}
      </>
    );
  }

  // ---- Step 3: what do you want? (a resume can never answer this) ----------
  if (step === 3) {
    const canContinue = form.targetTitles.length > 0;
    return shell(
      t(lang, 'What are you looking for?', '你想找什么工作?'),
      t(lang,
        'Your resume says where you have been. This says where you want to go — matching needs both.',
        '简历说明了你的过去,这一步说明你想去哪 —— 匹配两者都需要。'),
      <div className="space-y-4">
        <div>
          {label(t(lang, 'Target job titles', '目标职位'))}
          {input(form.targetTitles.join(', '), (v) => set('targetTitles', parseList(v)),
                 t(lang, 'e.g. Graduate Software Engineer, Data Analyst', '如:应届软件工程师, 数据分析师'), true)}
          <p className="text-[10px] text-slate-400 mt-1">
            {t(lang, 'Separate with commas. Required.', '用逗号分隔。必填。')}
          </p>
        </div>
        <div>
          {label(t(lang, 'Where', '地点'))}
          {input(form.targetLocations.join(', '), (v) => set('targetLocations', parseList(v)),
                 t(lang, 'e.g. Melbourne, Sydney', '如:Melbourne, 上海'))}
        </div>
        <div>
          {label(t(lang, 'Industries (optional)', '行业(选填)'))}
          {input(form.targetIndustries.join(', '), (v) => set('targetIndustries', parseList(v)))}
        </div>
      </div>,
      <>
        {backBtn(prev())}
        {nextBtn(4, undefined, !canContinue)}
        {!canContinue && (
          <span className="text-xs font-bold text-slate-400">{t(lang, 'Add at least one target title', '至少填一个目标职位')}</span>
        )}
      </>
    );
  }

  // ---- Step 4: constraints that decide hard eligibility --------------------
  if (step === 4) {
    return shell(
      t(lang, 'A few practical things', '几个实际条件'),
      t(lang,
        'These decide whether you are actually eligible for a role, so they carry the most weight in matching.',
        '这些决定你是否真的符合岗位硬性要求,在匹配里权重最高。'),
      <div className="space-y-4">
        <div>
          {label(t(lang, 'Work rights', '工作权利'))}
          {input(form.workRights || '', (v) => set('workRights', v),
                 t(lang, 'e.g. Citizen, PR, Student visa 485', '如:公民 / PR / 485签证'), true)}
          <p className="text-[10px] text-slate-400 mt-1">
            {t(lang, 'Getting this right stops us recommending jobs you cannot legally take.',
                     '填准这项,可以避免推荐你法律上无法入职的岗位。')}
          </p>
        </div>
        <div>
          {label(t(lang, 'Seniority', '资历级别'))}
          {input(form.seniority || '', (v) => set('seniority', v),
                 t(lang, 'e.g. Graduate, Mid, Senior', '如:应届 / 中级 / 资深'))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            {label(t(lang, 'Salary min', '最低薪资'))}
            <Field
              type="number"
              value={form.salaryMin ?? ''}
              onChange={(e) => set('salaryMin', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            {label(t(lang, 'Salary max', '最高薪资'))}
            <Field
              type="number"
              value={form.salaryMax ?? ''}
              onChange={(e) => set('salaryMax', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            {label(t(lang, 'Currency', '货币'))}
            <Field
              type="text"
              placeholder="AUD / CNY"
              value={form.salaryCurrency || ''}
              onChange={(e) => set('salaryCurrency', e.target.value)}
            />
          </div>
        </div>
        <div>
          {label(t(lang, 'Ways of working', '办公方式'))}
          <Select
            value={form.remotePreference || ''}
            onChange={(e) => set('remotePreference', (e.target.value || undefined) as CareerProfileInput['remotePreference'])}
          >
            <option value="">{t(lang, 'No preference', '无所谓')}</option>
            <option value="remote">{t(lang, 'Remote', '远程')}</option>
            <option value="hybrid">{t(lang, 'Hybrid', '混合')}</option>
            <option value="onsite">{t(lang, 'Onsite', '坐班')}</option>
            <option value="flexible">{t(lang, 'Flexible', '灵活')}</option>
          </Select>
        </div>
        {form.languages.length === 0 && (
          <div>
            {label(t(lang, 'Languages', '语言'))}
            {input(form.languages.join(', '), (v) => set('languages', parseList(v)), 'English, Mandarin')}
          </div>
        )}
      </div>,
      <>
        {backBtn(prev())}
        {nextBtn(5)}
      </>
    );
  }

  // ---- Step 5: contact details, so application forms can be filled ---------
  if (step === 5) {
    return shell(
      t(lang, 'How should employers reach you?', '雇主怎么联系你?'),
      t(lang,
        'These go on your resume and are what the browser extension types into application forms, so it never has to guess.',
        '这些会出现在简历上,也是浏览器插件填写申请表时用的内容 —— 有了它们插件就不用猜。'),
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            {label(t(lang, 'Email', '邮箱'))}
            {input(form.email || '', (v) => set('email', v), 'you@example.com', true)}
          </div>
          <div>
            {label(t(lang, 'Phone', '电话'))}
            {input(form.phone || '', (v) => set('phone', v), '+61 4XX XXX XXX')}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            {label(t(lang, 'City', '城市'))}
            {input(form.city || '', (v) => set('city', v), t(lang, 'Melbourne', '墨尔本'))}
          </div>
          <div>
            {label(t(lang, 'Country', '国家'))}
            {input(form.country || '', (v) => set('country', v), t(lang, 'Australia', '澳大利亚'))}
          </div>
        </div>
        <div>
          {label(t(lang, 'LinkedIn', 'LinkedIn'))}
          {input(form.linkedinUrl || '', (v) => set('linkedinUrl', v), 'https://linkedin.com/in/...')}
        </div>
        <div>
          {label(t(lang, 'Portfolio / GitHub (optional)', '作品集 / GitHub(选填)'))}
          {input(form.websiteUrl || '', (v) => set('websiteUrl', v), 'https://...')}
        </div>
      </div>,
      <>
        {backBtn(prev())}
        {nextBtn(6)}
      </>
    );
  }

  // ---- Step 5: optional, and visibly optional ------------------------------
  return shell(
    t(lang, 'Anything else? (all optional)', '还有别的吗?(全部选填)'),
    t(lang,
      'Only used for Chinese-market resume formats and filling in application forms. Never used to score or rank you against a job.',
      '仅用于中国市场的简历格式和申请表填写。不会参与职位匹配打分或排序。'),
    <div className="grid grid-cols-2 gap-4">
      <div>
        {label(t(lang, 'Age range', '年龄段'))}
        <Select
          value={form.optionalDemographics.ageBand || ''}
          onChange={(e) => set('optionalDemographics', {
            ...form.optionalDemographics,
            ageBand: (e.target.value || undefined) as AgeBand | undefined,
          })}
        >
          <option value="">{t(lang, 'Prefer not to say', '不想说')}</option>
          {AGE_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </div>
      <div>
        {label(t(lang, 'Gender', '性别'))}
        <Select
          value={form.optionalDemographics.gender || ''}
          onChange={(e) => set('optionalDemographics', {
            ...form.optionalDemographics,
            gender: (e.target.value || undefined) as GenderOption | undefined,
          })}
        >
          <option value="">{t(lang, 'Prefer not to say', '不想说')}</option>
          <option value="female">{t(lang, 'Female', '女')}</option>
          <option value="male">{t(lang, 'Male', '男')}</option>
          <option value="self-described">{t(lang, 'Self-described', '自述')}</option>
        </Select>
      </div>
      {form.optionalDemographics.gender === 'self-described' && (
        <Field
          type="text"
          className="col-span-2"
          placeholder={t(lang, 'How you describe it', '你希望如何表述')}
          value={form.optionalDemographics.genderSelfDescribed || ''}
          onChange={(e) => set('optionalDemographics', {
            ...form.optionalDemographics,
            genderSelfDescribed: e.target.value,
          })}
        />
      )}
    </div>,
    <>
      {backBtn(prev())}
      <Button onClick={() => onComplete(form)} disabled={saving}>
        {saving ? t(lang, 'Saving...', '保存中...') : t(lang, 'Finish setup', '完成设置')}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onComplete(form)} disabled={saving}>
        {t(lang, 'Skip this', '跳过这步')}
      </Button>
    </>
  );
}
