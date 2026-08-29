import type { CareerProfile } from '../../types';

/**
 * Application-form autofill.
 *
 * Two rules shape everything here:
 *
 * 1. **Never submit.** This module locates and writes input fields. It does not
 *    look for, focus, or click submit controls, and it never dispatches a form
 *    submit event. Pressing the button stays the user's act, because that is
 *    the moment the application becomes irreversible.
 *
 * 2. **Never guess a high-stakes answer.** Salary expectations, visa status,
 *    relocation and availability are detected and shown, but left empty for the
 *    user to answer. A wrong autofilled salary cannot be taken back once the
 *    form is sent, and the value the user wants is often specific to this one
 *    employer.
 *
 * Matching is label-driven rather than selector-driven. Reading a field's
 * label, `autocomplete`, `name`, `id`, `placeholder` and `aria-label` works
 * across ATSs that share no markup, and survives redesigns that would break a
 * per-site CSS selector. Site adapters exist only for platforms whose fields
 * are not real inputs.
 */

export type FieldKind =
  | 'firstName' | 'lastName' | 'fullName'
  | 'email' | 'phone'
  | 'city' | 'country' | 'address'
  | 'linkedin' | 'website'
  | 'workRights'
  // High-stakes: detected, surfaced, never written automatically.
  | 'salary' | 'visa' | 'relocation' | 'availability'
  | 'coverLetter'
  /** An open prose question the form asks in the employer's own words. */
  | 'openQuestion';

export const HIGH_STAKES: FieldKind[] = ['salary', 'visa', 'relocation', 'availability'];

/**
 * The fields an application asks for and a page's furniture does not.
 *
 * A job board is full of inputs: a location search, a pay filter, a newsletter
 * box. Matched one at a time they look fillable, and on a SEEK results page
 * the panel duly offered to write the user's city into the site's own search
 * box and called a pay filter their salary expectation — then offered to
 * submit it. An application form asks who you are; site chrome does not, so
 * two of these in one form is the signal.
 */
const IDENTITY: FieldKind[] = ['firstName', 'lastName', 'fullName', 'email', 'phone'];

export interface DetectedField {
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  kind: FieldKind;
  label: string;
  /** What autofill would write. Empty for high-stakes fields. */
  value: string;
  highStakes: boolean;
  alreadyFilled: boolean;
}

/**
 * Ordered: the first pattern that matches wins, so specific beats generic
 * ("first name" is tested before "name").
 *
 * These are PREFIX patterns — anchored at the start of a word with `\b`, but
 * deliberately not closed with a trailing `\b`. A closing boundary is a trap
 * here: `/\brelocat\b/` can never match "relocate", because there is no word
 * boundary between "t" and "e". That mistake made the relocation question
 * undetectable while the safety test still reported it as "left empty" —
 * passing for the wrong reason. Where a whole word really is meant (`name`,
 * `rate`), the boundary is written explicitly on that alternative.
 */
const PATTERNS: [FieldKind, RegExp][] = [
  ['firstName', /\b(first[\s_-]?name|given[\s_-]?name|forename|名字)/i],
  ['lastName', /\b(last[\s_-]?name|surname|family[\s_-]?name|姓氏)/i],
  ['email', /\b(e-?mail|邮箱|电子邮件)/i],
  ['phone', /\b(phone|mobile|telephone|\btel\b|contact[\s_-]?number|手机|电话|联系方式)/i],
  ['linkedin', /\b(linked-?in)/i],
  ['website', /\b(website|portfolio|personal[\s_-]?site|github|个人网站|作品集)/i],
  ['salary', /\b(salary|salaries|remuneration|compensation|expected[\s_-]?pay|pay[\s_-]?expect|\brate\b|薪)/i],
  ['visa', /\b(visa|work[\s_-]?(right|authoriz|authoris|permit|entitle)|right[\s_-]?to[\s_-]?work|eligib(le|ility)[\s_-]?to[\s_-]?work|sponsor|签证|工作权利)/i],
  ['relocation', /\b(relocat|willing[\s_-]?to[\s_-]?move|搬迁|异地)/i],
  ['availability', /\b(availab|notice[\s_-]?period|start[\s_-]?date|when[\s_-]?can[\s_-]?you|到岗|入职时间)/i],
  ['coverLetter', /\b(cover[\s_-]?letter|motivation|why[\s_-]?(do|are)[\s_-]?you|求职信)/i],
  ['city', /\b(city|suburb|town|locality|城市)/i],
  ['country', /\b(country|国家)/i],
  ['address', /\b(address|street|地址)/i],
  ['fullName', /\b(full[\s_-]?name|your[\s_-]?name|\bname\b|姓名)/i],
];

const CONTROLS = 'input:not([type=hidden]), textarea, select';

/**
 * Protected attributes. Detected only so they can be left alone: not filled,
 * not surfaced, and above all never drafted.
 *
 * Real application forms put "Are you Hispanic/Latino?" in the same textbox
 * shape as "Why do you want to join us?", and the first pass treated them the
 * same. Generating an answer to an ethnicity question would be the single
 * worst thing this panel could do, so these are dropped before any other rule
 * gets a chance to claim them. The resume importer already refuses to extract
 * the same attributes.
 */
const DEMOGRAPHIC =
  /\b(hispanic|latino|latinx|ethnic|\brace\b|racial|gender|\bsex\b|sexual[\s_-]?orientation|transgender|pronoun|veteran|disab|marital|religio|date[\s_-]?of[\s_-]?birth|\bage\b|民族|性别|婚姻|宗教|残疾|出生日期)/i;

/**
 * A field the employer expects sentences in.
 *
 * A textarea qualifies on its own. A plain text input only qualifies if its
 * label actually reads as a question, because most short inputs are facts
 * (postcode, referee name) and drafting prose into one would be nonsense.
 */
/* An open question's label is the employer's sentence, and describe() appends
   the field's name for the ones that have no readable label. Keeping "q1" on
   the end of "Why do you want to work here?" reads like a typo in the panel
   and goes into the prompt as part of the question. */
function labelFor(el: HTMLElement, kind: FieldKind): string {
  let raw = describe(el).trim();
  if (kind !== 'openQuestion') return raw.slice(0, 80);

  // Drop the appended field name, whether the question ends in ? or a stop.
  const own = [(el as HTMLInputElement).name, el.id].filter(Boolean);
  for (const n of own) {
    if (raw.length > n.length + 8 && raw.toLowerCase().endsWith(n.toLowerCase())) {
      raw = raw.slice(0, -n.length).trim();
    }
  }
  return raw.slice(0, 160);
}

function isOpenQuestion(el: HTMLElement): boolean {
  /* Greenhouse and friends build their dropdowns out of a text input driving a
     listbox, so "Have you worked here before?" arrives looking exactly like a
     free-text question. Drafting a paragraph into a combobox produces nonsense
     the user then has to notice and undo. */
  if (
    el.getAttribute('role') === 'combobox' ||
    el.getAttribute('aria-haspopup') === 'listbox' ||
    el.hasAttribute('aria-autocomplete') ||
    (el as HTMLInputElement).readOnly ||
    el.getAttribute('aria-expanded') !== null
  ) return false;

  if (el.tagName === 'TEXTAREA') return true;
  const type = (el as HTMLInputElement).type;
  if (el.tagName !== 'INPUT' || !['text', 'search', ''].includes(type)) return false;
  const label = describe(el);
  if (label.length < 12) return false;
  return /\?|^(why|what|how|describe|tell us|explain)\b|请(说明|描述|谈谈)|为什么|请简述/i.test(label);
}

/**
 * Everything a field says about itself, nearest description first.
 *
 * The nearness rules are not fussiness. An earlier version walked up to any
 * ancestor `div` and took its first `<label>`, which on a normal form is the
 * *form's* first label — so every field on the page described itself as "First
 * name", every field matched the firstName pattern, and the wrong value would
 * have been typed into a real job application. A container's label is only
 * trusted when that container holds exactly one form control, and only within
 * a few levels.
 */
function describe(el: Element): string {
  /* Forms commonly carry both a <label for> and an aria-label saying the same
     thing, and pushing both produced "Why do you want to join Figma?* Why do
     you want to join Figma?" — read once by a person, twice by the model. */
  const parts: string[] = [];
  const add = (text: string | null | undefined) => {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const seenAlready = parts.some(
      (p) => p.includes(clean) || clean.includes(p)
    );
    if (!seenAlready) parts.push(clean);
  };
  const id = el.getAttribute('id');

  // 1. An explicit association is unambiguous.
  if (id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (forLabel?.textContent) add(forLabel.textContent);
  }

  // 2. A label wrapping the input is equally unambiguous.
  const wrapping = el.closest('label');
  if (wrapping?.textContent) add(wrapping.textContent);

  // 3. Otherwise look for a label-ish node that belongs to this field alone:
  //    walk up a few levels, stopping as soon as the container holds more than
  //    one control (at which point its heading describes the group, not us).
  if (!parts.length) {
    let node: Element | null = el.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      if (node.querySelectorAll(CONTROLS).length > 1) break;
      const heading = node.querySelector('label, legend, [class*="label"], [class*="Label"]');
      if (heading?.textContent?.trim()) {
        add(heading.textContent);
        break;
      }
    }
  }

  // 4. A preceding sibling is a common label pattern when no <label> exists.
  if (!parts.length) {
    let prev = el.previousElementSibling;
    while (prev && !prev.textContent?.trim()) prev = prev.previousElementSibling;
    if (prev && !prev.matches(CONTROLS) && (prev.textContent || '').trim().length < 120) {
      add(prev.textContent);
    }
  }

  // 5. The field's own attributes always contribute.
  for (const attr of ['aria-label', 'name', 'id', 'placeholder', 'autocomplete', 'data-automation-id']) {
    const v = el.getAttribute(attr);
    add(v);
  }

  return parts
    .join(' ')
    // The required marker and a radio's on/off state are form chrome, not part
    // of what the employer asked.
    .replace(/\s*\*+/g, '')
    .replace(/\s+\b(on|off)\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(el: Element): FieldKind | null {
  const type = (el as HTMLInputElement).type;
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';

  const auto = el.getAttribute('autocomplete') || '';
  if (/given-name/.test(auto)) return 'firstName';
  if (/family-name/.test(auto)) return 'lastName';
  if (auto === 'name') return 'fullName';
  if (/^email$/.test(auto)) return 'email';
  if (/tel/.test(auto)) return 'phone';

  const text = describe(el);
  if (!text) return null;
  for (const [kind, re] of PATTERNS) if (re.test(text)) return kind;
  return null;
}

function splitName(full?: string): { first: string; last: string } {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] || '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function valueFor(kind: FieldKind, p: CareerProfile, coverLetter?: string): string {
  const { first, last } = splitName(p.fullName);
  switch (kind) {
    case 'firstName': return first;
    case 'lastName': return last;
    case 'fullName': return p.fullName || '';
    case 'email': return p.email || '';
    case 'phone': return p.phone || '';
    case 'city': return p.city || (p.targetLocations || [])[0] || '';
    case 'country': return p.country || '';
    case 'linkedin': return p.linkedinUrl || '';
    case 'website': return p.websiteUrl || '';
    case 'workRights': return p.workRights || '';
    case 'coverLetter': return coverLetter || '';
    // High-stakes: intentionally blank. See the note at the top of this file.
    default: return '';
  }
}

const isVisible = (el: HTMLElement): boolean => {
  if (el.hidden || (el as HTMLInputElement).disabled) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
};

/** Finds what this page's form is asking for, and what we could answer. */
export function detectFields(profile: CareerProfile, coverLetter?: string): DetectedField[] {
  const nodes = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    )
  );

  const found: DetectedField[] = [];
  const seen = new Set<FieldKind>();

  for (const el of nodes) {
    const type = (el as HTMLInputElement).type;
    // Never touch credentials, payment, file pickers or hidden state.
    if (['password', 'hidden', 'file', 'submit', 'button', 'image', 'reset'].includes(type)) continue;
    if (!isVisible(el)) continue;

    // Before anything else: protected attributes are not this panel's business.
    if (DEMOGRAPHIC.test(describe(el))) continue;

    let kind = classify(el);

    /* Anything unmatched that asks for prose is an open question — "why do you
       want this role", "describe a time when". These are the fields that
       actually cost applicants their evening, and until now the panel skipped
       them entirely because no pattern matched. Detected here, drafted
       elsewhere: nothing is written into them without the user reading it. */
    if (!kind && isOpenQuestion(el)) kind = 'openQuestion';
    if (!kind) continue;

    // One field per kind: forms often repeat a name in a hidden step or a
    // "confirm" duplicate, and filling both is how wrong values spread.
    if (seen.has(kind) && kind !== 'coverLetter' && kind !== 'openQuestion') continue;

    const highStakes = HIGH_STAKES.includes(kind);
    // Open questions carry no value yet: the draft is generated on request.
    let value = highStakes || kind === 'openQuestion' ? '' : valueFor(kind, profile, coverLetter);

    /* "Why do you want to work here" matches the cover-letter pattern, so with
       no cover letter generated it used to be dropped for having no value —
       silently losing the single question most worth drafting. With nothing to
       paste in, it is an open question like any other. */
    if (kind === 'coverLetter' && !value && isOpenQuestion(el)) {
      kind = 'openQuestion';
      value = '';
    }

    if (!highStakes && kind !== 'openQuestion' && !value) continue; // nothing to offer

    seen.add(kind);
    found.push({
      el,
      kind,
      label: labelFor(el, kind),
      value,
      highStakes,
      alreadyFilled: !!(el as HTMLInputElement).value?.trim(),
    });
  }

  return applicationFormOnly(found);
}

/**
 * Keeps only the fields belonging to the one group that looks like a real
 * application, and returns nothing when no group does.
 *
 * Grouped by enclosing form, because a page can hold several: a search form, a
 * newsletter form and, sometimes, the application. Falling back to the whole
 * document covers the ATSs that never wrap their fields in a form element at
 * all.
 */
function applicationFormOnly(fields: DetectedField[]): DetectedField[] {
  if (!fields.length) return fields;

  const groups = new Map<Element | null, DetectedField[]>();
  for (const f of fields) {
    const key = f.el.closest('form');
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }

  const identityCount = (list: DetectedField[]) =>
    new Set(list.filter((f) => IDENTITY.includes(f.kind)).map((f) => f.kind)).size;

  let best: DetectedField[] = [];
  let bestScore = 0;
  for (const list of groups.values()) {
    const score = identityCount(list);
    if (score > bestScore) { best = list; bestScore = score; }
  }

  // Unformed ATS pages: judge the page as a whole rather than per group.
  if (bestScore < 2 && identityCount(fields) >= 2 && groups.size === 1) return fields;

  return bestScore >= 2 ? best : [];
}

/**
 * Writes a value the way a real user would, so frameworks notice.
 *
 * React and Angular track input state internally and ignore a plain
 * `el.value = x`; the native setter plus an input/change event is what makes
 * the change stick rather than being reverted on the next render.
 */
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): boolean {
  try {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (el instanceof HTMLSelectElement) {
      const match = Array.from(el.options).find(
        (o) => o.value.toLowerCase() === value.toLowerCase() || o.text.toLowerCase().includes(value.toLowerCase())
      );
      if (!match) return false;
      el.value = match.value;
    } else if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

/** Fills the given fields. Returns how many were written.
 *
 * High-stakes fields are skipped even if a caller passes them in — the guard
 * lives here as well as in detection so a future caller cannot route around it
 * by accident. */
export function fillFields(fields: DetectedField[], overwrite = false): number {
  let filled = 0;
  for (const f of fields) {
    if (f.highStakes) continue;
    if (!f.value) continue;
    if (f.alreadyFilled && !overwrite) continue;
    if (setValue(f.el, f.value)) {
      filled++;
      f.el.style.transition = 'background-color .6s ease';
      const prev = f.el.style.backgroundColor;
      f.el.style.backgroundColor = '#eef2ff';
      setTimeout(() => { f.el.style.backgroundColor = prev; }, 1400);
    }
  }
  return filled;
}

/** Scrolls the first unanswered high-stakes question into view, so the user is
 * taken to what still needs their judgement rather than left to hunt. */
export function focusFirstHighStakes(fields: DetectedField[]): boolean {
  const target = fields.find((f) => f.highStakes && !f.alreadyFilled);
  if (!target) return false;
  target.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => target.el.focus(), 400);
  return true;
}

export const KIND_LABEL: Record<FieldKind, [string, string]> = {
  firstName: ['First name', '名'],
  lastName: ['Last name', '姓'],
  fullName: ['Full name', '姓名'],
  email: ['Email', '邮箱'],
  phone: ['Phone', '电话'],
  city: ['City', '城市'],
  country: ['Country', '国家'],
  address: ['Address', '地址'],
  linkedin: ['LinkedIn', 'LinkedIn'],
  website: ['Website', '个人网站'],
  workRights: ['Work rights', '工作权利'],
  salary: ['Salary expectation', '期望薪资'],
  visa: ['Visa / work rights', '签证 / 工作权利'],
  relocation: ['Relocation', '是否愿意搬迁'],
  availability: ['Availability', '到岗时间'],
  coverLetter: ['Cover letter', '求职信'],
  openQuestion: ['Their question', '对方的问题'],
};


/**
 * Finds the form's own submit control.
 *
 * Deliberately narrow: a real submit button inside the form that holds the
 * fields we filled. Job pages are full of things that look like submission —
 * "Save job", "Sign in", newsletter forms — and clicking the wrong one on a
 * page the user has asked us to submit is worse than doing nothing.
 */
export function findSubmitButton(fields: DetectedField[]): HTMLElement | null {
  const form = fields.map((f) => f.el.closest('form')).find(Boolean) as HTMLFormElement | undefined;
  const scope: ParentNode = form ?? document;

  const labelled = Array.from(
    scope.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]')
  ).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const text = `${el.textContent || ''} ${(el as HTMLInputElement).value || ''} ${el.getAttribute('aria-label') || ''}`;
    if (/save|sign in|log in|cancel|back|收藏|登录|取消|返回/i.test(text)) return false;
    return /submit|apply|send|继续|提交|申请|投递/i.test(text) || (el as HTMLInputElement).type === 'submit';
  });

  return labelled[0] ?? null;
}

/** High-stakes answers the user has still not given. Submitting with any of
 *  these blank is the case that cannot be undone, so the panel refuses. */
export function unansweredHighStakes(fields: DetectedField[]): DetectedField[] {
  return fields.filter((f) => f.highStakes && !f.el.value?.trim());
}
