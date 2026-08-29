import type { AnalysisResult, CanonicalJob, CanonicalJobInput, CareerProfile, MatchSnapshot } from '../../types';
import { extractCurrentJob } from './adapters';
import { PANEL_STYLES } from './panel-styles';
import {
  PANEL_TEMPLATES, RESUME_VIEW_CSS, coverLetterHtml, printDocument, resumeHtml, tailoredTitle,
  type PanelTemplate,
} from './resume-view';
import {
  KIND_LABEL,
  detectFields,
  fillFields,
  findSubmitButton,
  focusFirstHighStakes,
  type DetectedField,
  unansweredHighStakes,
} from './autofill';
import { isChatFirst } from './adapters';

/**
 * The floating panel on a job page.
 *
 * Rendered into a shadow root so the host site's CSS cannot reach in and our
 * styles cannot leak out — job boards ship aggressive global stylesheets, and
 * without isolation the panel inherits whatever LinkedIn or SEEK happen to set
 * on `div`, `button` and `*`.
 *
 * A side panel rather than a floating bubble: an explainable match is five
 * weighted dimensions plus notes plus a gap list, which a bubble cannot hold
 * without becoming a scroll-in-a-scroll.
 */

// Credit costs mirror credits.ts. Duplicated as literals rather than imported
// because credits.ts is a server/web module; if these drift, the deduction is
// still authoritative server-side — this only affects the label shown.
const COST_MATCH = 1;
const COST_TAILOR = 2;
const COST_IMPORT = 1;
const COST_ANSWERS = 1;
const COST_GREETING = 1;

const ROOT_ID = 'fastresume-career-agent-root';

type State = {
  collapsed: boolean;
  loading: string | null;
  error: string | null;
  jobInput: CanonicalJobInput | null;
  job: CanonicalJob | null;
  snapshot: MatchSnapshot | null;
  tailored: { id: number; content: AnalysisResult } | null;
  saved: boolean;
  /** 'main' is the compact panel; 'doc' widens it to read what was written. */
  view: 'main' | 'doc' | 'fill' | 'profile' | 'greet';
  /** Draft held while the profile form is open. */
  draft: ProfileDraft;
  doc: 'resume' | 'letter';
  template: PanelTemplate;
  profile: CareerProfile | null;
  fields: DetectedField[];
  filledCount: number | null;
  /** Settled: this page was watched and holds no job ad. */
  noJob: boolean;
  /** The submit confirmation is showing. */
  confirmSubmit: boolean;
  /** This form has been submitted from the panel. */
  submitted: boolean;
  /** Drafted answers, keyed by the field index they belong to. */
  greeting: { message: string; grounded: boolean; gap?: string } | null;
  copiedGreeting: boolean;
  drafts: Record<string, { answer: string; grounded: boolean; gap?: string; used: boolean; edited?: boolean }>;
};

interface ProfileDraft {
  titles: string;
  locations: string;
  workRights: string;
  seniority: string;
  salaryMin: string;
  salaryMax: string;
  remote: string;
}

const state: State = {
  collapsed: true,
  loading: null,
  error: null,
  jobInput: null,
  job: null,
  snapshot: null,
  tailored: null,
  saved: false,
  view: 'main',
  draft: { titles: '', locations: '', workRights: '', seniority: '', salaryMin: '', salaryMax: '', remote: '' },
  doc: 'resume',
  template: 'Minimalist',
  profile: null,
  fields: [],
  filledCount: null,
  noJob: false,
  confirmSubmit: false,
  submitted: false,
  drafts: {},
  greeting: null,
  copiedGreeting: false,
};

let shadow: ShadowRoot | null = null;

function send<T = any>(message: unknown): Promise<{ ok: boolean; data?: T; error?: string }> {
  return chrome.runtime.sendMessage(message).catch((e) => ({ ok: false, error: String(e) }));
}

/**
 * The language the user chose in FastResume, mirrored here by the auth content
 * script. Browser locale is only a fallback: someone running an English Chrome
 * who picked Chinese in the app expects the panel in Chinese, and guessing
 * from navigator.language got that exactly backwards for those users.
 */
let appLang: string | null = null;
const uiLang = (): 'en' | 'zh' =>
  (appLang ?? navigator.language).startsWith('zh') ? 'zh' : 'en';
const t = (en: string, zh: string) => (uiLang() === 'zh' ? zh : en);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const ACTION_LABEL: Record<string, [string, string, string]> = {
  // key: [en, zh, tone]
  priority_apply: ['Priority apply', '优先投递', 'good'],
  apply: ['Apply', '建议投递', 'ok'],
  consider: ['Consider', '可以考虑', 'warn'],
  skip: ['Skip', '不建议', 'bad'],
};

function dimRow(label: string, d?: { score: number; weight: number; notes: string }): string {
  if (!d) return '';
  return `
    <div class="fr-dim">
      <div class="fr-dim-head">
        <span class="fr-dim-label">${esc(label)} <span class="fr-dim-weight">${Math.round(d.weight * 100)}%</span></span>
        <span class="fr-dim-score">${Math.round(d.score)}</span>
      </div>
      <div class="fr-bar"><div class="fr-bar-fill" style="width:${Math.min(100, Math.max(0, d.score))}%"></div></div>
      ${d.notes ? `<p class="fr-dim-notes">${esc(d.notes)}</p>` : ''}
    </div>`;
}

function docHtml(): string {
  const c = state.tailored?.content;
  const r = c?.optimizedResume;
  if (!c || !r) return '';
  const hasLetter = !!c.coverLetter;

  return `
    <div class="fr-doc-bar">
      <button class="fr-link" data-act="back">&larr; ${t('Back', '返回')}</button>
      <div class="fr-doc-tabs">
        <button class="fr-doc-tab ${state.doc === 'resume' ? 'on' : ''}" data-act="tab-resume">${t('Resume', '简历')}</button>
        ${hasLetter ? `<button class="fr-doc-tab ${state.doc === 'letter' ? 'on' : ''}" data-act="tab-letter">${t('Cover letter', '求职信')}</button>` : ''}
      </div>
    </div>
    <div class="fr-tpl-bar">
      <span class="fr-label">${t('Template', '模板')}</span>
      <div class="fr-tpls">
        ${PANEL_TEMPLATES.map((tpl) => `<button class="fr-tpl ${state.template === tpl.value ? 'on' : ''}"
            data-act="tpl-${tpl.value}">${uiLang() === 'zh' ? tpl.zh : tpl.label}</button>`).join('')}
      </div>
    </div>
    <div class="fr-sheet-wrap">
      <div class="rv-sheet">
        ${state.doc === 'letter' && hasLetter
          ? coverLetterHtml(c.coverLetter!, r, state.template)
          : resumeHtml(r, state.template)}
      </div>
    </div>
    <div class="fr-doc-actions">
      <button class="fr-btn fr-primary" data-act="print">${t('Download PDF', '下载 PDF')}</button>
      <button class="fr-btn" data-act="copy">${t('Copy text', '复制文本')}</button>
      <button class="fr-btn fr-ghost" data-act="open-app">${t('More templates', '更多模板')}</button>
    </div>`;
}

/* Three tiers, three colours, three glyphs. The panel used to explain each of
   them in a paragraph; a tick, a bang and a question mark say the same thing
   in the width of a character, which leaves the prose for the one line that
   actually carries a promise. */
const ICON = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  you: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 8v5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none"/></svg>',
  ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><path d="M9.2 9.3a2.9 2.9 0 115.2 1.8c-.9 1-2.4 1.4-2.4 3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.4" r="1.25" fill="currentColor" stroke="none"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const head = (tier: 'auto' | 'you' | 'ask' | 'send' | 'done', label: string, n?: number) => `
  <p class="fr-head-row fr-t-${tier}">
    <span class="fr-ico">${ICON[tier]}</span>
    <span class="fr-head-label">${label}</span>
    ${n !== undefined ? `<span class="fr-count">${n}</span>` : ''}
  </p>`;

function fillHtml(): string {
  /* Open questions are neither: they have their own section with drafts, and
     counting them here made the panel promise to fill four things when it
     could fill two. */
  const fillable = state.fields.filter((f) => !f.highStakes && f.kind !== 'openQuestion');
  const needsYou = state.fields.filter((f) => f.highStakes);
  const allFilled = fillable.length > 0 && fillable.every((f) => f.alreadyFilled);

  const row = (f: DetectedField) => `
    <div class="fr-fill-row ${f.highStakes ? 'ask' : ''}">
      <div class="fr-fill-l">
        <span class="fr-fill-kind">${uiLang() === 'zh' ? KIND_LABEL[f.kind][1] : KIND_LABEL[f.kind][0]}</span>
        ${f.alreadyFilled ? `<span class="fr-fill-note">${t('already filled', '已有内容')}</span>` : ''}
      </div>
      <div class="fr-fill-v">${
        f.highStakes
          ? `<span class="fr-fill-ask">${t('you answer', '你来填')}</span>`
          : esc(f.value).slice(0, 60)
      }</div>
    </div>`;

  return `
    <div class="fr-doc-bar">
      <button class="fr-link" data-act="back">&larr; ${t('Back', '返回')}</button>
    </div>

    ${state.filledCount !== null
      ? state.filledCount > 0
        ? `<p class="fr-done">${t(`Filled ${state.filledCount} field(s).`, `已填写 ${state.filledCount} 项。`)}
             ${needsYou.length ? t('Check the highlighted questions below before you submit.', '提交前请先回答下面标出的问题。') : ''}</p>`
        : `<p class="fr-note">${t(
            'Everything we can fill already has a value. Use "Replace" to overwrite it.',
            '可填的字段都已经有内容了。要覆盖请点"重新填写"。')}</p>`
      : ''}

    ${fillable.length
      ? `<div class="fr-fill-group fr-g-auto">
          ${head('auto', t('Filled for you', '已替你填好'), fillable.length)}
          ${fillable.map(row).join('')}
        </div>`
      : `<div class="fr-empty">
          <p class="fr-empty-title">${t('No application form here', '这个页面上没有申请表')}</p>
          <p class="fr-empty-sub">${t(
            'A job page is not an application. Press Apply, then open this panel on the form itself.',
            '职位详情页不是申请表。先点对方的「申请」,到了表单页面再打开这里。')}</p>
        </div>`}

    ${needsYou.length
      ? `<div class="fr-fill-group ask-group fr-g-you">
          ${head('you', t('Only you can answer', '只能你自己答'), needsYou.length)}
          ${needsYou.map(row).join('')}
          <p class="fr-fill-why">${t('Never auto-filled. Wrong here cannot be undone.',
                                     '这几项从不代填。答错了改不回来。')}</p>
        </div>`
      : ''}

    ${fillable.length || needsYou.length ? `<div class="fr-doc-actions">
      ${allFilled
        ? `<button class="fr-btn" data-act="do-refill">${t('Replace with mine', '用我的内容覆盖')}</button>`
        : `<button class="fr-btn fr-primary" data-act="do-fill" ${fillable.length ? '' : 'disabled'}>
             ${t('Fill these in', '填入表单')}
           </button>`}
      ${needsYou.length ? `<button class="fr-btn" data-act="goto-ask">${t('Go to my questions', '跳到我要答的')}</button>` : ''}
    </div>` : ''}
    ${openQuestionsHtml()}
    ${submitBlockHtml(needsYou)}`;
}

/**
 * The questions a form asks in the employer's own words.
 *
 * Drafts are shown before they are written anywhere. An answer inserted
 * straight into the box would be a statement made to an employer in the
 * applicant's name that the applicant has not read, which is not a
 * convenience, it is a forgery of their voice. So: draft, show, and write only
 * on "use this".
 *
 * A draft the model could not ground in the profile is labelled as such rather
 * than hidden. That is the one the user most needs to rewrite.
 */
function openQuestionsHtml(): string {
  const qs = state.fields.filter((f) => f.kind === 'openQuestion');
  if (!qs.length) return '';

  const anyDraft = Object.keys(state.drafts).length > 0;
  const busy = state.loading === 'answers';

  return `
    <div class="fr-fill-group">
      ${head('ask', t('They asked', '对方的问题'), qs.length)}
      ${qs.map((f, i) => {
        const d = state.drafts[String(i)];
        return `
        <div class="fr-q">
          <p class="fr-q-ask">${esc(f.label)}</p>
          ${d ? `
            <div class="fr-q-draft ${d.grounded || d.edited ? '' : 'fr-q-thin'}">
              ${d.edited ? `<p class="fr-q-mine">${t('Your words now.', '这是你自己写的了。')}</p>` : ''}
              ${d.grounded || d.edited ? '' : `<p class="fr-q-warn">
                  <span class="fr-ico">${ICON.you}</span>
                  <span>${t('Not fully backed by your profile.', '档案撑不起这句。')}${d.gap ? ` ${esc(d.gap)}` : ''}</span>
                </p>`}
              <!-- Editable in place. A draft you can only accept or copy makes
                   the user open a second window to change one sentence, which
                   is the trip out of the page this panel exists to remove. -->
              <textarea class="fr-q-edit" data-draft="${i}" rows="4">${esc(d.answer)}</textarea>
              <div class="fr-q-actions">
                <button class="fr-btn" data-act="use-answer" data-i="${i}">
                  ${d.used ? t('Fill again', '再填一次') : t('Use this', '填入这一题')}
                </button>
                <button class="fr-btn" data-act="copy-answer" data-i="${i}">${t('Copy', '复制')}</button>
              </div>
            </div>` : ''}
        </div>`;
      }).join('')}

      <button class="fr-btn ${anyDraft ? '' : 'fr-primary'}" data-act="draft-answers" ${busy ? 'disabled' : ''}>
        ${busy
          ? t('Drafting…', '正在起草…')
          : anyDraft
            ? t('Draft again', '重新起草')
            : t(`Draft answers · ${COST_ANSWERS}`, `帮我起草回答 · ${COST_ANSWERS} 积分`)}
      </button>
      <p class="fr-fill-why">${t('From your profile only. Nothing enters the form until you say so.',
                                 '只用你档案里的事实。你不点"填入"就不会写进表单。')}</p>
    </div>`;
}

/**
 * The last mile: offer to press Submit, after asking.
 *
 * Filling a form and then leaving the user to hunt for the button is most of
 * the tedium and none of the risk removed, which is what the panel is for. It
 * is still a question, never a silent send, and the panel says exactly what it
 * is about to do.
 *
 * The one case it refuses outright is a blank high-stakes answer. Salary, visa,
 * relocation and start date cannot be taken back once the form is gone, and an
 * empty visa field submitted on someone's behalf is a misrepresentation, not a
 * bad user experience.
 */
function submitBlockHtml(needsYou: DetectedField[]): string {
  const blank = unansweredHighStakes(state.fields);
  /* Offered whenever the panel can see the form, not only when it did the
     filling: a form the user typed themselves is still a form they may want
     submitted, and tying the offer to our own fill hid it after any Back. */
  if (!state.fields.length) {
    return `<p class="fr-fill-why">${t('Nothing is sent without you.', '不会背着你提交。')}</p>`;
  }

  if (state.submitted) {
    return `<div class="fr-submit-box fr-submit-done">
      ${head('done', t('Submitted', '已提交'))}
      <p class="fr-fill-why">${t('Check the page for their confirmation.', '请在页面上确认对方的回执。')}</p>
    </div>`;
  }

  if (blank.length) {
    return `<div class="fr-submit-box fr-g-you">
      ${head('you', t('Still blank', '还没答'), blank.length)}
      <p class="fr-fill-why">${t('Not submitting until these are yours.',
                                 '这几项没填,就不会提交。')}</p>
      <button class="fr-btn" data-act="goto-ask">${t('Answer them', '去回答')}</button>
    </div>`;
  }

  if (!state.confirmSubmit) {
    return `<div class="fr-submit-box">
      <button class="fr-btn fr-primary" data-act="ask-submit">
        <span class="fr-ico">${ICON.send}</span>${t('Submit this application', '帮我提交这份申请')}
      </button>
      <p class="fr-fill-why">${t('You confirm first, with the answers shown.',
                                 '会先把内容列给你确认。')}</p>
    </div>`;
  }

  const shown = state.fields.filter((f) => f.highStakes || f.kind === 'email' || f.kind === 'phone');
  return `<div class="fr-submit-box fr-submit-confirm">
    ${head('send', t('About to submit', '即将提交'))}
    ${shown.map((f) => `
      <div class="fr-fill-row">
        <div class="fr-fill-label">${esc(f.label).slice(0, 40)}</div>
        <div class="fr-fill-val">${esc(f.el.value || '').slice(0, 60)}</div>
      </div>`).join('')}
    <p class="fr-fill-why">${t('One click on their submit button. Cannot be undone.',
                               '点一次对方的提交按钮。无法撤回。')}</p>
    <div class="fr-doc-actions">
      <button class="fr-btn fr-primary" data-act="do-submit">${t('Yes, submit', '确认提交')}</button>
      <button class="fr-btn" data-act="cancel-submit">${t('Not yet', '先不要')}</button>
    </div>
  </div>`;
}

/**
 * The short half of the Career Profile: targets and hard constraints. These
 * drive the hard-requirements and goals dimensions, together about 55% of the
 * score.
 *
 * The other 45% needs work history, education and skills, which only a resume
 * can supply — hence the import button rather than a dozen more fields. A
 * profile with targets and no history scores near zero on skills and makes
 * every job look wrong for a reason that is not true.
 */
function profileHtml(): string {
  const d = state.draft;
  const field = (key: keyof ProfileDraft, label: string, ph: string, wide = true) => `
    <label class="fr-f ${wide ? '' : 'fr-f-half'}">
      <span class="fr-f-label">${label}</span>
      <input class="fr-f-input" data-field="${key}" value="${esc(d[key])}" placeholder="${esc(ph)}" />
    </label>`;

  const imported = state.profile?.importedFromResumeAt;
  const skills = state.profile?.derivedSkills?.length || 0;
  const roles = state.profile?.workHistory?.length || 0;

  return `
    <div class="fr-form">
      <p class="fr-f-title">${t('What are you looking for?', '你想找什么工作?')}</p>
      ${field('titles', t('Target job titles', '目标职位'), t('e.g. Graduate Backend Engineer', '如:应届后端工程师'))}
      ${field('locations', t('Where', '地点'), t('e.g. Melbourne', '如:墨尔本'))}
      ${field('workRights', t('Work rights', '工作权'), t('e.g. Australian PR', '如:澳洲永久居民'))}
      <div class="fr-f-row">
        ${field('seniority', t('Seniority', '资历'), t('Graduate', '应届'), false)}
        ${field('remote', t('Work mode', '办公方式'), t('hybrid', '混合'), false)}
      </div>
      <div class="fr-f-row">
        ${field('salaryMin', t('Salary from', '薪资下限'), '70000', false)}
        ${field('salaryMax', t('to', '薪资上限'), '90000', false)}
      </div>

      <div class="fr-f-import">
        <p class="fr-f-label">${t('Experience and skills', '经历与技能')}</p>
        ${imported
          ? `<p class="fr-f-note">${t(
              `Read from your resume — ${roles} roles, ${skills} skills.`,
              `已从你的简历读出 —— ${roles} 段经历、${skills} 项技能。`)}</p>`
          : `<p class="fr-f-note">${t(
              'Targets alone cannot score the skills half. Read them from the resume already in your account.',
              '只填目标没法给"技能与经历"打分。从你账号里已有的简历读一次就行。')}</p>
             <button class="fr-btn" data-act="import-profile" ${state.loading === 'import' ? 'disabled' : ''}>
               ${state.loading === 'import'
                 ? t('Reading your resume…', '正在读取简历…')
                 : t(`Use my resume (${COST_IMPORT} credit)`, `用我已有的简历(${COST_IMPORT} 积分)`)}
             </button>`}
      </div>

      <div class="fr-actions">
        <button class="fr-btn fr-primary" data-act="save-profile" ${state.loading === 'profile' ? 'disabled' : ''}>
          ${state.loading === 'profile' ? t('Saving…', '保存中…') : t('Save and score', '保存并打分')}
        </button>
        <button class="fr-btn" data-act="back">${t('Cancel', '取消')}</button>
      </div>
      ${state.error && state.view === 'profile'
        ? `<p class="fr-empty-sub fr-err">${esc(state.error)}</p>` : ''}
    </div>`;
}

/**
 * The opening message, on the boards where a message is the application.
 *
 * Copy is the primary action, not "fill it in for me". BOSS直聘 blocks
 * automated browsers behind a security check, so its chat box selectors could
 * not be verified against the real page — and a fill button that silently
 * misses is worse than a copy button that always works. Filling is offered as
 * a best effort beside it, and says so when it cannot find the box.
 *
 * It is never sent. A message to a recruiter is irreversible in the same way a
 * submitted form is, and for the same reason the send stays with the user.
 */
function greetingHtml(): string {
  const g = state.greeting;
  const busy = state.loading === 'greeting';

  return `
    <div class="fr-fill-group">
      ${head('ask', t('Opening message', '打招呼'), undefined)}
      <p class="fr-fill-why">${t(
        'This board has no application form — the message is the application.',
        '这个网站没有申请表 —— 你发的这条消息就是申请。')}</p>

      ${g ? `
        <div class="fr-q-draft ${g.grounded ? '' : 'fr-q-thin'}" style="margin-top:12px">
          ${g.grounded ? '' : `<p class="fr-q-warn">
            <span class="fr-ico">${ICON.you}</span>
            <span>${t('Not fully backed by your profile.', '档案撑不起这句。')}${g.gap ? ` ${esc(g.gap)}` : ''}</span>
          </p>`}
          <textarea class="fr-q-edit" data-greeting="1" rows="5">${esc(g.message)}</textarea>
          <div class="fr-q-actions">
            <button class="fr-btn fr-primary" data-act="copy-greeting">
              ${state.copiedGreeting ? t('Copied', '已复制') : t('Copy', '复制')}
            </button>
            <button class="fr-btn" data-act="put-greeting">${t('Put in the box', '填进输入框')}</button>
          </div>
        </div>` : ''}

      <button class="fr-btn ${g ? '' : 'fr-primary'}" data-act="draft-greeting" ${busy ? 'disabled' : ''} style="margin-top:12px">
        ${busy
          ? t('Writing…', '正在写…')
          : g
            ? t('Write another', '重写一条')
            : t(`Write my opening message · ${COST_GREETING}`, `帮我写打招呼 · ${COST_GREETING} 积分`)}
      </button>
      <p class="fr-fill-why">${t(
        'From your profile only. Nothing is sent — you press send yourself.',
        '只用你档案里的事实。不会替你发送 —— 发送键你自己按。')}</p>
      ${state.error && state.view === 'greet' ? `<p class="fr-empty-sub fr-err">${esc(state.error)}</p>` : ''}
    </div>`;
}

function bodyHtml(): string {
  if (state.view === 'fill') return fillHtml();
  if (state.view === 'greet') return greetingHtml();
  if (state.view === 'doc' && state.tailored) return docHtml();

  if (state.error === 'NOT_SIGNED_IN') {
    return `<div class="fr-empty">
      <p class="fr-empty-title">${t('Sign in to FastResume', '请先登录 FastResume')}</p>
      <p class="fr-empty-sub">${t('Open the app and sign in — this panel then picks up your account automatically.', '打开网页版登录一次,插件会自动同步你的账号。')}</p>
      <button class="fr-btn fr-primary" data-act="open-app">${t('Open FastResume', '打开 FastResume')}</button>
    </div>`;
  }
  if (state.view === 'profile') return profileHtml();

  if (state.error === 'NO_PROFILE') {
    return `<div class="fr-empty">
      <p class="fr-empty-title">${t('Finish your Career Profile', '请先完成 Career Profile')}</p>
      <p class="fr-empty-sub">${t(
        'Matching needs to know what you are looking for. It takes a minute, right here.',
        '匹配需要先知道你想找什么工作。就在这里填,一分钟。')}</p>
      <button class="fr-btn fr-primary" data-act="edit-profile">${t('Fill it in here', '在这里填')}</button>
      <button class="fr-btn" data-act="open-app">${t('Open the full form', '打开完整表单')}</button>
    </div>`;
  }
  if (state.error === 'NO_BASE_RESUME') {
    return `<div class="fr-empty">
      <p class="fr-empty-title">${t('No resume to tailor from', '还没有可用来定制的简历')}</p>
      <p class="fr-empty-sub">${t('Tailoring rewrites your existing resume — it never invents one. Create one in the app first.', '定制是在你已有简历上改写重点,不会凭空生成。请先在网页版生成一份。')}</p>
      <button class="fr-btn fr-primary" data-act="open-app">${t('Open FastResume', '打开 FastResume')}</button>
    </div>`;
  }
  if (state.error === 'OUT_OF_CREDITS') {
    return `<div class="fr-empty">
      <p class="fr-empty-title">${t('Out of credits', '积分不足')}</p>
      <button class="fr-btn fr-primary" data-act="open-app">${t('Top up', '去充值')}</button>
    </div>`;
  }
  if (state.error) {
    return `<div class="fr-empty"><p class="fr-empty-sub fr-err">${esc(state.error)}</p>
      <button class="fr-btn" data-act="retry">${t('Try again', '重试')}</button></div>`;
  }

  const job = state.job || state.jobInput;
  if (!job && state.noJob) {
    return `<div class="fr-empty">
      <p class="fr-empty-title">${t('No job ad on this page', '这个页面上没有职位详情')}</p>
      <p class="fr-empty-sub">${t(
        'Open a job, then this panel reads it and scores it against your profile.',
        '打开一个具体职位,这里就会读取它并按你的资料打分。')}</p>
    </div>`;
  }
  if (!job) return `<div class="fr-empty"><p class="fr-empty-sub">${t('Reading this page…', '正在读取页面…')}</p></div>`;

  const s = state.snapshot;
  const action = s ? ACTION_LABEL[s.recommendedAction] : null;

  return `
    <div class="fr-job">
      <p class="fr-job-title">${esc(job.title)}</p>
      <p class="fr-job-company">${esc(job.company)}</p>
      ${job.location ? `<p class="fr-job-meta">${esc(job.location)}</p>` : ''}
    </div>

    ${
      s
        ? `<div class="fr-score">
            <div class="fr-score-head">
              <div>
                <p class="fr-label">${t('Career Fit', '匹配度')}</p>
                <p class="fr-score-num">${Math.round(s.overallScore)}<span>%</span></p>
              </div>
              ${action ? `<span class="fr-chip fr-${action[2]}">${uiLang() === 'zh' ? action[1] : action[0]}</span>` : ''}
            </div>
            <div class="fr-dims">
              ${dimRow(t('Hard requirements', '硬性资格'), s.scoreBreakdown?.hardRequirements)}
              ${dimRow(t('Skills & experience', '技能与经历'), s.scoreBreakdown?.skillsExperience)}
              ${dimRow(t('Goals & preferences', '目标与偏好'), s.scoreBreakdown?.goalsPreferences)}
              ${dimRow(t('Opportunity quality', '机会质量'), s.scoreBreakdown?.opportunityQuality)}
            </div>
            ${
              (s.hardGaps || []).length
                ? `<div class="fr-gaps">
                    <p class="fr-label fr-label-bad">${t('Hard gaps', '硬性缺口')}</p>
                    <ul>${s.hardGaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
                  </div>`
                : ''
            }
          </div>`
        : `<button class="fr-btn fr-primary fr-wide" data-act="score" ${state.loading ? 'disabled' : ''}>
             ${state.loading === 'score' ? t('Scoring…', '打分中…') : t(`How well does this fit? · ${COST_MATCH}`, `这个职位适合我吗? · ${COST_MATCH} 积分`)}
           </button>`
    }

    ${
      state.tailored
        ? `<button class="fr-btn fr-primary fr-wide" data-act="view-doc">
             ${t('View resume &amp; cover letter', '查看简历和求职信')}
           </button>`
        : `<button class="fr-btn fr-wide" data-act="tailor" ${state.loading ? 'disabled' : ''}>
             ${state.loading === 'tailor' ? t('Writing…', '生成中…') : t(`Tailor my resume for this · ${COST_TAILOR}`, `为这个职位定制简历 · ${COST_TAILOR} 积分`)}
           </button>`
    }

    ${isChatFirst(location.href)
      ? `<button class="fr-btn fr-wide fr-primary" data-act="open-greet">
           ${t('Write my opening message', '帮我写打招呼')}
         </button>`
      : ''}
    <button class="fr-btn fr-wide" data-act="scan">
      ${t('Fill this application form', '帮我填这个申请表')}
    </button>

    ${
      state.saved
        ? `<p class="fr-done">${t('Saved to Applications.', '已保存到 Applications。')}</p>`
        : `<button class="fr-btn fr-ghost fr-wide" data-act="save" ${state.loading ? 'disabled' : ''}>
             ${state.loading === 'save' ? t('Saving…', '保存中…') : t('Save to Applications', '保存到 Applications')}
           </button>`
    }
  `;
}

function render(): void {
  if (!shadow) return;
  const panel = shadow.getElementById('fr-panel');
  const tab = shadow.getElementById('fr-tab');
  if (!panel || !tab) return;

  // Only the document view earns the extra width: an A4 page needs it. The
  // autofill review deliberately stays narrow — the whole point is watching
  // the form fill in beside the panel, which a wide panel would cover.
  const wide = state.view === 'doc' ? ' fr-wide-panel' : '';
  panel.className = (state.collapsed ? 'fr-panel fr-collapsed' : 'fr-panel') + wide;
  tab.style.display = state.collapsed ? 'flex' : 'none';
  reservePageWidth(state.collapsed ? 0 : (state.view === 'doc' ? 860 : 380));

  const scoreBadge = state.snapshot ? `${Math.round(state.snapshot.overallScore)}%` : '';
  tab.innerHTML = `<span class="fr-tab-mark">FastResume</span>${scoreBadge ? `<span class="fr-tab-score">${scoreBadge}</span>` : ''}`;

  const body = shadow.getElementById('fr-body');
  if (body) body.innerHTML = bodyHtml();

  // An A4 sheet is 210mm wide, which is wider than the panel. Scale it to fit
  // and reserve the height the scaled sheet actually occupies, so the page
  // reads at true proportions instead of being cropped or squashed.
  const wrap = shadow.querySelector('.fr-sheet-wrap') as HTMLElement | null;
  const sheet = wrap?.querySelector('.rv-sheet') as HTMLElement | null;
  if (wrap && sheet) {
    const scale = Math.min(1, wrap.clientWidth / sheet.offsetWidth);
    sheet.style.setProperty('--rv-scale', String(scale));
    wrap.style.height = `${sheet.offsetHeight * scale}px`;
  }
}

/** Job boards render the ad after the URL changes, not with it. On SEEK the
 *  address updates to ?jobId=... a full second before the ad body exists, so a
 *  single extraction at that moment reads an empty page and gives up for good.
 *  Measured on au.seek.com: 0 characters at the URL change, 3716 a second
 *  later. Keep looking until the ad appears or the run is superseded. */
let runId = 0;

async function waitForJob(mine: number): Promise<ReturnType<typeof extractCurrentJob>> {
  for (let i = 0; i < 20; i++) {
    if (mine !== runId) return null;
    const found = extractCurrentJob();
    if (found) return found;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function analyse(): Promise<void> {
  const mine = ++runId;

  /* Mount before we know whether there is a job. A search results page that
     shows nothing at all is indistinguishable from a broken extension, which
     is exactly how this read to the first person who tried it. */
  mount();
  state.noJob = false;
  render();

  const extracted = await waitForJob(mine);
  if (mine !== runId) return;
  if (!extracted) {
    state.noJob = true;
    render();
    return;
  }
  state.jobInput = extracted;
  render();

  const res = await send<{
    job: CanonicalJob; snapshot: MatchSnapshot | null; profile: CareerProfile; lang?: string | null;
  }>({
    type: 'ANALYSE_JOB',
    job: extracted,
    lang: uiLang(),
    cost: COST_MATCH,
  });

  if (!res.ok) state.error = res.error || 'Something went wrong';
  else {
    state.job = res.data!.job;
    state.snapshot = res.data!.snapshot;
    state.profile = res.data!.profile;
    appLang = res.data!.lang ?? appLang;
    state.error = null;
  }
  render();
}

async function onAction(act: string, source?: HTMLElement): Promise<void> {
  if (act === 'open-app') {
    void send({ type: 'OPEN_APP' });
    return;
  }
  if (act === 'view-doc') { state.view = 'doc'; state.doc = 'resume'; render(); return; }
  if (act === 'back') { state.view = 'main'; state.filledCount = null; state.error = null; render(); return; }

  if (act === 'edit-profile') {
    // Seed the form from whatever the profile already holds, so reopening it
    // is editing rather than starting again.
    const p = state.profile;
    state.draft = {
      titles: (p?.targetTitles || []).join(', '),
      locations: (p?.targetLocations || []).join(', '),
      workRights: p?.workRights || '',
      seniority: p?.seniority || '',
      salaryMin: p?.salaryMin != null ? String(p.salaryMin) : '',
      salaryMax: p?.salaryMax != null ? String(p.salaryMax) : '',
      remote: p?.remotePreference || '',
    };
    state.view = 'profile';
    state.error = null;
    render();
    return;
  }

  if (act === 'import-profile') {
    state.loading = 'import';
    state.error = null;
    render();
    const res = await send<{ profile: CareerProfile }>({ type: 'IMPORT_PROFILE', lang: uiLang(), cost: COST_IMPORT });
    state.loading = null;
    if (res.ok) state.profile = res.data.profile;
    else state.error = res.error;
    render();
    return;
  }

  if (act === 'save-profile') {
    const d = state.draft;
    const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
    if (!list(d.titles).length) {
      state.error = t('Add at least one target job title', '至少填一个目标职位');
      render();
      return;
    }
    const num = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };
    state.loading = 'profile';
    state.error = null;
    render();
    const res = await send<{ profile: CareerProfile }>({
      type: 'SAVE_PROFILE',
      profile: {
        targetTitles: list(d.titles),
        targetLocations: list(d.locations),
        workRights: d.workRights.trim() || undefined,
        seniority: d.seniority.trim() || undefined,
        salaryMin: num(d.salaryMin),
        salaryMax: num(d.salaryMax),
        remotePreference: (d.remote.trim() || undefined) as CareerProfile['remotePreference'],
      },
    });
    state.loading = null;
    if (!res.ok) { state.error = res.error; render(); return; }
    state.profile = res.data.profile;
    state.view = 'main';
    state.error = null;
    render();
    // The panel opened on NO_PROFILE, so nothing about this job is loaded yet.
    void analyse();
    return;
  }

  if (act === 'scan') {
    if (!state.profile) { state.error = 'NO_PROFILE'; render(); return; }
    state.fields = detectFields(state.profile, state.tailored?.content?.coverLetter);
    state.filledCount = null;
    state.view = 'fill';
    render();
    return;
  }
  if (act === 'do-fill' || act === 'do-refill') {
    state.filledCount = fillFields(state.fields, act === 'do-refill');
    // Re-detect so the list reflects what is now on the page.
    if (state.profile) state.fields = detectFields(state.profile, state.tailored?.content?.coverLetter);
    render();
    return;
  }
  if (act === 'goto-ask') { focusFirstHighStakes(state.fields); return; }

  if (act === 'open-greet') { state.view = 'greet'; state.error = null; render(); return; }

  if (act === 'draft-greeting') {
    if (!state.job) return;
    state.loading = 'greeting';
    state.error = null;
    state.copiedGreeting = false;
    render();
    const res = await send<{ greeting: { message: string; grounded: boolean; gap?: string } }>({
      type: 'DRAFT_GREETING', job: state.job, lang: uiLang(), cost: COST_GREETING,
    });
    state.loading = null;
    if (res.ok) state.greeting = res.data.greeting;
    else state.error = res.error;
    render();
    return;
  }

  if (act === 'copy-greeting') {
    if (!state.greeting) return;
    await navigator.clipboard.writeText(state.greeting.message).catch(() => undefined);
    state.copiedGreeting = true;
    render();
    setTimeout(() => { state.copiedGreeting = false; render(); }, 1600);
    return;
  }

  if (act === 'put-greeting') {
    if (!state.greeting) return;
    /* Best effort. These sites block automated browsers behind a security
       check, so the selectors could not be verified against a real page; when
       the box is not found the panel says so instead of appearing to succeed,
       and Copy is always there. */
    const box = [...document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 120 && r.height > 20 && !el.closest('#' + ROOT_ID);
      })
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];

    if (!box) {
      state.error = t(
        'Could not find the message box — use Copy and paste it yourself.',
        '没找到输入框 —— 用「复制」自己粘贴进去。');
      render();
      return;
    }
    if (box instanceof HTMLTextAreaElement) {
      box.value = state.greeting.message;
    } else {
      box.textContent = state.greeting.message;
    }
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    box.focus();
    state.error = null;
    render();
    return;
  }

  if (act === 'draft-answers') {
    if (!state.job) return;
    const qs = state.fields.filter((f) => f.kind === 'openQuestion');
    if (!qs.length) return;
    state.loading = 'answers';
    state.error = null;
    render();
    const res = await send<{ answers: { id: string; answer: string; grounded: boolean; gap?: string }[] }>({
      type: 'ANSWER_QUESTIONS',
      job: state.job,
      questions: qs.map((f, i) => ({ id: String(i), question: f.label })),
      lang: uiLang(),
      cost: COST_ANSWERS,
    });
    state.loading = null;
    if (!res.ok) { state.error = res.error; render(); return; }
    state.drafts = {};
    for (const a of res.data.answers) {
      state.drafts[a.id] = { answer: a.answer, grounded: a.grounded, gap: a.gap, used: false };
    }
    render();
    return;
  }

  if (act === 'use-answer' || act === 'copy-answer') {
    const i = source?.dataset.i;
    if (i === undefined) return;
    const d = state.drafts[i];
    if (!d) return;
    if (act === 'copy-answer') {
      await navigator.clipboard.writeText(d.answer).catch(() => undefined);
      return;
    }
    const target = state.fields.filter((f) => f.kind === 'openQuestion')[Number(i)];
    if (!target) return;
    const input = target.el as HTMLTextAreaElement;
    input.value = d.answer;
    // Frameworks listen for these; setting .value alone leaves React unaware.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    d.used = true;
    render();
    return;
  }

  if (act === 'ask-submit') { state.confirmSubmit = true; render(); return; }
  if (act === 'cancel-submit') { state.confirmSubmit = false; render(); return; }

  if (act === 'do-submit') {
    /* Re-check at the moment of the click, not when the panel was drawn: the
       user may have emptied an answer between confirming and pressing. */
    if (unansweredHighStakes(state.fields).length) {
      state.confirmSubmit = false;
      render();
      return;
    }
    const btn = findSubmitButton(state.fields);
    if (!btn) {
      state.error = t(
        'Could not find this form\u2019s submit button — please press it yourself.',
        '没能找到这个表单的提交按钮 —— 请你自己点一下。');
      state.confirmSubmit = false;
      render();
      return;
    }
    /* Clicking a submit button does nothing when the form fails the browser's
       own validation, and it fails silently. Saying "submitted" then would
       leave someone believing they had applied when they had not, which is
       worse than not submitting at all. So: confirm the form is valid, then
       watch for the submit event and only claim success if it actually fires. */
    const form = btn.closest('form') as HTMLFormElement | null;
    if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
      form.reportValidity();
      state.error = t(
        'The form rejected something — it is highlighted on the page. Fix it, then try again.',
        '表单有一项没通过校验,页面上已经标出来了。改好之后再试一次。');
      state.confirmSubmit = false;
      render();
      return;
    }

    let fired = false;
    const seen = () => { fired = true; };
    (form ?? document).addEventListener('submit', seen, true);
    btn.click();
    await new Promise((r) => setTimeout(r, 400));
    (form ?? document).removeEventListener('submit', seen, true);

    state.confirmSubmit = false;
    if (fired || !document.contains(btn)) {
      state.submitted = true;
      state.error = null;
    } else {
      state.error = t(
        'The page did not accept the click. Please press Submit yourself.',
        '页面没有接受这次点击。请你自己点一下提交。');
    }
    render();
    return;
  }
  if (act === 'tab-resume') { state.doc = 'resume'; render(); return; }
  if (act === 'tab-letter') { state.doc = 'letter'; render(); return; }
  if (act.startsWith('tpl-')) {
    state.template = act.slice(4) as PanelTemplate;
    render();
    return;
  }

  if (act === 'print') {
    const c = state.tailored?.content;
    const r = c?.optimizedResume;
    if (!c || !r) return;
    const isLetter = state.doc === 'letter' && !!c.coverLetter;
    printDocument(
      tailoredTitle(c, state.job?.title, isLetter ? 'letter' : 'resume'),
      isLetter ? coverLetterHtml(c.coverLetter!, r, state.template) : resumeHtml(r, state.template)
    );
    return;
  }

  if (act === 'copy') {
    const c = state.tailored?.content;
    if (!c) return;
    const plain =
      state.doc === 'letter'
        ? c.coverLetter || ''
        : [c.optimizedResume?.fullName, c.optimizedResume?.summary,
           ...(c.optimizedResume?.experiences || []).map((e: any) =>
             `${e.role} — ${e.company} (${e.period})\n${(e.bullets || []).join('\n')}`)]
          .filter(Boolean).join('\n\n');
    void navigator.clipboard.writeText(plain);
    const btn = shadow?.querySelector('[data-act="copy"]');
    if (btn) { btn.textContent = t('Copied', '已复制'); setTimeout(() => render(), 1500); }
    return;
  }
  if (act === 'retry') {
    state.error = null;
    await analyse();
    return;
  }
  if (!state.job) return;

  state.error = null;

  if (act === 'score') {
    state.loading = 'score';
    render();
    const res = await send<{ snapshot: MatchSnapshot }>({ type: 'SCORE', job: state.job, lang: uiLang(), cost: COST_MATCH });
    state.loading = null;
    if (!res.ok) state.error = res.error!;
    else state.snapshot = res.data!.snapshot;
    render();
  }

  if (act === 'tailor') {
    state.loading = 'tailor';
    render();
    const res = await send<{ id: number; content: AnalysisResult }>({
      type: 'TAILOR', job: state.job, lang: uiLang(), cost: COST_TAILOR,
    });
    state.loading = null;
    if (!res.ok) state.error = res.error!;
    else {
      state.tailored = { id: res.data!.id, content: res.data!.content };
      // Writing it and then hiding it would defeat the point — show it.
      state.view = 'doc';
      state.doc = 'resume';
    }
    render();
  }

  if (act === 'save') {
    state.loading = 'save';
    render();
    const res = await send({
      type: 'SAVE_APPLICATION',
      jobId: state.job.id,
      matchSnapshotId: state.snapshot?.id,
      tailoredResumeId: state.tailored?.id,
    });
    state.loading = null;
    if (!res.ok) state.error = res.error!;
    else state.saved = true;
    render();
  }
}

/**
 * Narrows the page instead of covering it.
 *
 * The panel is fixed to the right edge, and on a split-view job board the ad
 * itself is on the right — so an overlay hides exactly the thing the user
 * opened the panel to read. Giving the document a right margin makes the site
 * reflow into what is left, and the ad moves over rather than disappearing.
 *
 * The previous inline value is kept and put back on collapse, so a site that
 * set its own margin is not quietly robbed of it.
 */
let priorMargin: string | null = null;
let priorTransition: string | null = null;

function reservePageWidth(px: number): void {
  const root = document.documentElement;
  if (priorMargin === null) {
    priorMargin = root.style.marginRight;
    priorTransition = root.style.transition;
  }
  if (px <= 0) {
    root.style.marginRight = priorMargin;
    root.style.transition = priorTransition || '';
    priorMargin = null;
    priorTransition = null;
    return;
  }
  // Never squeeze the page to nothing on a narrow window; the panel already
  // caps itself at 96vw, and below that an overlay is the honest trade.
  const reserve = window.innerWidth - px < 480 ? 0 : px;
  root.style.transition = 'margin-right .28s cubic-bezier(0.16,1,0.3,1)';
  root.style.marginRight = reserve ? `${reserve}px` : priorMargin || '';
}

function mount(): void {
  if (document.getElementById(ROOT_ID)) return;

  const host = document.createElement('div');
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);

  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PANEL_STYLES + RESUME_VIEW_CSS;
  shadow.appendChild(style);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button id="fr-tab" class="fr-tab" title="FastResume Career Agent"></button>
    <aside id="fr-panel" class="fr-panel fr-collapsed">
      <header class="fr-head">
        <span class="fr-brand">FastResume <b>Career Agent</b></span>
        <button class="fr-close" data-act="collapse" aria-label="Close">&times;</button>
      </header>
      <div id="fr-body" class="fr-body"></div>
    </aside>`;
  shadow.appendChild(wrap);

  shadow.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement)?.closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.dataset.act!;
    if (act === 'collapse') {
      state.collapsed = true;
      render();
      return;
    }
    void onAction(act, el);
  });

  /* Typing updates the draft but must NOT re-render: render() rewrites the
     body's innerHTML, which would destroy the input and take the caret with
     it on every keystroke. */
  shadow.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | null;
    const key = el?.dataset?.field as keyof ProfileDraft | undefined;
    if (key) { state.draft[key] = el!.value; return; }

    const draftIndex = el?.dataset?.draft;
    if (draftIndex && state.drafts[draftIndex]) {
      state.drafts[draftIndex].answer = el!.value;
      /* Marked as the user's own words, not as grounded. Editing a draft does
         not make the profile support it; it makes the sentence theirs, which is
         a different claim and the only one we can actually make. */
      state.drafts[draftIndex].edited = true;
    }
  });

  shadow.getElementById('fr-tab')!.addEventListener('click', () => {
    state.collapsed = false;
    render();
  });
}

// Job boards are single-page apps: the URL changes without a reload, so watch
// for it rather than only running once at document_idle.
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    Object.assign(state, {
      loading: null, error: null, jobInput: null, job: null,
      snapshot: null, tailored: null, saved: false, noJob: false,
      confirmSubmit: false, submitted: false, drafts: {}, greeting: null,
    });
    void analyse();
  }
}, 1200);

void analyse();
