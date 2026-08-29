import type { AnalysisResult, ResumeContent } from '../../types';

/**
 * Renders a generated resume and cover letter inside the panel, on a real A4
 * page, and prints it to PDF without leaving the job board.
 *
 * ON TEMPLATES: this is a PORT of the web app's designs, not shared code. The
 * layouts in ResumePreview.tsx are React components defined inside that
 * component's closure — they read its pagination state (pageMap,
 * resumePageCount, manual overrides) and its inline editing wrappers. Reusing
 * them here would mean bundling React into a content script AND lifting five
 * layouts out of a 113KB working file. The visual design is replicated in CSS
 * instead. The cost of that choice: a template change on the web app has to be
 * mirrored here, and the two can drift.
 *
 * Only the three templates that survive at panel scale are ported. Academic
 * and Grid are dense multi-column layouts that need the full editor to be
 * useful, so the panel points at the web app for those rather than shipping a
 * cramped imitation.
 */

export type PanelTemplate = 'Minimalist' | 'Professional' | 'Creative';

export const PANEL_TEMPLATES: { value: PanelTemplate; label: string; zh: string }[] = [
  { value: 'Minimalist', label: 'Minimalist', zh: '简约' },
  { value: 'Professional', label: 'Professional', zh: '专业' },
  { value: 'Creative', label: 'Creative', zh: '创意' },
];

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const has = (a?: unknown[]) => Array.isArray(a) && a.length > 0;

interface RoleEntry {
  role?: string;
  company?: string;
  period?: string;
  bullets?: string[];
}

function roles(list?: RoleEntry[]): string {
  return (list || [])
    .map(
      (e) => `
      <div class="rv-role">
        <div class="rv-role-head">
          <span class="rv-role-title">${esc(e.role)}</span>
          <span class="rv-role-period">${esc(e.period)}</span>
        </div>
        ${e.company ? `<p class="rv-role-company">${esc(e.company)}</p>` : ''}
        ${has(e.bullets) ? `<ul>${(e.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      </div>`
    )
    .join('');
}

function eduBlock(list?: any[]): string {
  return (list || [])
    .map(
      (e) => `
      <div class="rv-role">
        <div class="rv-role-head">
          <span class="rv-role-title">${esc(e.school)}</span>
          <span class="rv-role-period">${esc([e.startDate, e.endDate].filter(Boolean).join(' – '))}</span>
        </div>
        <p class="rv-role-company">${esc([e.degree, e.gpa].filter(Boolean).join(' · '))}</p>
      </div>`
    )
    .join('');
}

const chips = (items?: string[]) =>
  has(items) ? `<p class="rv-chips">${(items || []).map((s) => `<span>${esc(s)}</span>`).join('')}</p>` : '';

const sec = (title: string, inner: string) =>
  inner ? `<section class="rv-sec"><h3>${esc(title)}</h3>${inner}</section>` : '';

/** Sections shared by every template, in the order the web app uses. */
function commonSections(r: ResumeContent): string {
  return [
    sec('Summary', r.summary ? `<p>${esc(r.summary)}</p>` : ''),
    sec('Education', eduBlock(r.education)),
    sec('Honors & Awards', has(r.awards) ? `<ul>${(r.awards || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''),
    sec('Skills', chips(r.technicalSkills) + chips(r.softSkills)),
    sec('Experience', roles(r.experiences as RoleEntry[])),
    sec('Projects', roles(r.schoolProjects as RoleEntry[])),
    sec('Volunteering', roles(r.volunteer as RoleEntry[])),
  ].join('');
}

/** Ported from MinimalistLayout: heavy sans name, accent rule under the header,
 * uppercase tracked section rules. */
function minimalist(r: ResumeContent): string {
  return `
    <div class="rv-page theme-minimalist">
      <header class="rv-head">
        <h1>${esc(r.fullName)}</h1>
        ${r.jobTitle ? `<h2>${esc(r.jobTitle)}</h2>` : ''}
        <div class="rv-rule"></div>
        ${r.contactInfo ? `<p class="rv-contact">${esc(r.contactInfo)}</p>` : ''}
      </header>
      ${commonSections(r)}
    </div>`;
}

/** Ported from ProfessionalLayout: centred serif header over a heavy rule. */
function professional(r: ResumeContent): string {
  return `
    <div class="rv-page theme-professional">
      <header class="rv-head">
        <h1>${esc(r.fullName)}</h1>
        ${r.jobTitle ? `<h2>${esc(r.jobTitle)}</h2>` : ''}
        ${r.contactInfo ? `<p class="rv-contact">${esc(r.contactInfo)}</p>` : ''}
      </header>
      ${commonSections(r)}
    </div>`;
}

/** Ported from CreativeLayout: 30% tinted sidebar with the identity and
 * skills, main column for history. The avatar circle falls back to the
 * initial, as it does on the web app when no photo is set. */
function creative(r: ResumeContent): string {
  return `
    <div class="rv-page theme-creative">
      <aside class="rv-side">
        <div class="rv-avatar">${esc((r.fullName || '?').charAt(0))}</div>
        <h1>${esc(r.fullName)}</h1>
        ${r.jobTitle ? `<h2>${esc(r.jobTitle)}</h2>` : ''}
        ${r.contactInfo ? `<div class="rv-contact">${esc(r.contactInfo)}</div>` : ''}
        ${sec('Skills', chips(r.technicalSkills) + chips(r.softSkills))}
        ${sec('Education', eduBlock(r.education))}
      </aside>
      <main class="rv-main">
        ${sec('Summary', r.summary ? `<p>${esc(r.summary)}</p>` : '')}
        ${sec('Experience', roles(r.experiences as RoleEntry[]))}
        ${sec('Projects', roles(r.schoolProjects as RoleEntry[]))}
        ${sec('Volunteering', roles(r.volunteer as RoleEntry[]))}
        ${sec('Honors & Awards', has(r.awards) ? `<ul>${(r.awards || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '')}
      </main>
    </div>`;
}

export function resumeHtml(r: ResumeContent, template: PanelTemplate = 'Minimalist'): string {
  if (template === 'Professional') return professional(r);
  if (template === 'Creative') return creative(r);
  return minimalist(r);
}

export function coverLetterHtml(letter: string, r: ResumeContent, template: PanelTemplate = 'Minimalist'): string {
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const themeClass = template === 'Professional' ? 'theme-professional' : 'theme-minimalist';
  return `
    <div class="rv-page ${themeClass}">
      <header class="rv-head">
        <h1>${esc(r.fullName)}</h1>
        ${r.contactInfo ? `<p class="rv-contact">${esc(r.contactInfo)}</p>` : ''}
      </header>
      <p class="rv-date">${esc(date)}</p>
      <div class="rv-letter">
        ${esc(letter).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
      </div>
    </div>`;
}

/**
 * A4 geometry and the three ported themes.
 *
 * The page is a real 210×297mm box rather than a fluid div, so what is on
 * screen has the same proportions and line breaks as the printed file. On
 * screen it is scaled with a CSS transform (see --rv-scale); print resets that
 * to 1 so the PDF is full size.
 */
const DOC_CSS = `
  .rv-sheet { width: 210mm; min-height: 297mm; background: #fff;
    box-shadow: 0 10px 40px rgba(15,23,42,.10); transform-origin: top left;
    transform: scale(var(--rv-scale, 1)); }
  .rv-page { width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box;
    font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
    color: #0f172a; font-size: 10pt; line-height: 1.4; }

  .rv-sec { margin-top: 7mm; }
  .rv-sec h3 { margin: 0 0 3mm; font-size: 11pt; }
  .rv-sec p { margin: 0; }
  .rv-sec ul { margin: 1.5mm 0 0; padding-left: 5mm; }
  .rv-sec li { margin-bottom: 0.8mm; }
  .rv-role { margin-bottom: 4mm; }
  .rv-role-head { display: flex; justify-content: space-between; gap: 6mm; align-items: baseline; }
  .rv-role-title { font-weight: 800; }
  .rv-role-period { font-size: 8.5pt; color: #94a3b8; white-space: nowrap; font-weight: 600; }
  .rv-role-company { margin: 0.5mm 0 1.5mm; font-weight: 600; font-size: 9.5pt; }
  .rv-chips { display: flex; flex-wrap: wrap; gap: 1.5mm; margin: 0 0 1.5mm; }
  .rv-chips span { background: #eef2ff; color: #4338ca; padding: 0.8mm 2mm;
    border-radius: 1.2mm; font-size: 8.5pt; font-weight: 700; }
  .rv-date { margin: 6mm 0; font-size: 8.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: #94a3b8; }
  .rv-letter p { margin: 0 0 4mm; }

  /* Minimalist — sans, accent rule, tracked section heads */
  .theme-minimalist .rv-head { margin-bottom: 9mm; }
  .theme-minimalist .rv-head h1 { margin: 0; font-size: 28pt; font-weight: 900; line-height: 1.1; }
  .theme-minimalist .rv-head h2 { margin: 1mm 0 0; font-size: 12pt; font-weight: 600; color: #4f46e5; }
  .theme-minimalist .rv-rule { height: 1.5mm; width: 16mm; border-radius: 99px;
    background: #4f46e5; margin: 3.5mm 0; }
  .theme-minimalist .rv-contact { margin: 0; color: #64748b; font-weight: 700;
    text-transform: uppercase; letter-spacing: .12em; font-size: 8pt; }
  .theme-minimalist .rv-sec h3 { text-transform: uppercase; font-weight: 900;
    letter-spacing: .12em; color: #4f46e5; border-bottom: 1px solid #f1f5f9; padding-bottom: 1.5mm; }

  /* Professional — centred serif header over a heavy rule */
  .theme-professional { font-family: "Times New Roman", Georgia, serif; }
  .theme-professional .rv-head { text-align: center; border-bottom: 2px solid #1e293b;
    padding-bottom: 5mm; margin-bottom: 7mm; }
  .theme-professional .rv-head h1 { margin: 0 0 2.5mm; font-size: 26pt; font-weight: 700; color: #000; }
  .theme-professional .rv-head h2 { margin: 0 0 2mm; font-size: 12pt; font-weight: 600; color: #4f46e5; }
  .theme-professional .rv-contact { margin: 0; color: #475569; font-size: 10pt; }
  .theme-professional .rv-sec h3 { text-transform: uppercase; font-weight: 700;
    letter-spacing: .08em; color: #4f46e5; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; }
  .theme-professional .rv-chips span { font-family: inherit; }

  /* Creative — tinted 30% sidebar, main column for history */
  .theme-creative { display: flex; padding: 0; }
  .theme-creative .rv-side { width: 30%; background: #f8fafc; border-right: 1px solid #f1f5f9;
    padding: 12mm 8mm; }
  .theme-creative .rv-main { flex: 1; padding: 12mm 10mm; }
  .theme-creative .rv-avatar { width: 22mm; height: 22mm; border-radius: 50%; background: #4f46e5;
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 20pt; font-weight: 800; margin-bottom: 5mm; }
  .theme-creative .rv-side h1 { margin: 0; font-size: 19pt; font-weight: 900; color: #4f46e5; line-height: 1.15; }
  .theme-creative .rv-side h2 { margin: 2mm 0 3mm; font-size: 11pt; font-weight: 700; }
  .theme-creative .rv-contact { color: #64748b; font-weight: 700; font-size: 8.5pt; line-height: 1.6; }
  .theme-creative .rv-sec h3 { text-transform: uppercase; font-weight: 900;
    letter-spacing: .1em; color: #4f46e5; }
  .theme-creative .rv-side .rv-role-head { flex-direction: column; gap: 0; }
  .theme-creative .rv-side .rv-role-period { white-space: normal; }
`;

export const RESUME_VIEW_CSS = DOC_CSS;

/**
 * Opens the browser's print dialog for the document, using a detached iframe.
 *
 * An iframe rather than window.print(): printing the current window would
 * print the job board underneath. This keeps the user on the page — no tab
 * switch, no trip to the web app — and "Save as PDF" in that dialog produces
 * the file. Going through the print pipeline also means the PDF contains real
 * selectable text, which is the whole point of a resume an ATS has to parse; a
 * canvas-to-image PDF would be unreadable to one.
 */
export function printDocument(title: string, innerHtml: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.documentElement.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; }
      ${DOC_CSS}
      /* Undo the on-screen scale: the PDF is full size. */
      .rv-sheet { transform: none; box-shadow: none; }
    </style></head>
    <body><div class="rv-sheet">${innerHtml}</div></body></html>`);
  doc.close();

  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Removing the frame while the dialog is still open cancels the job in
    // some Chrome builds, so leave it around.
    setTimeout(() => frame.remove(), 60000);
  };

  if (doc.readyState === 'complete') setTimeout(go, 80);
  else frame.onload = () => setTimeout(go, 80);
}

/**
 * The filename the browser seeds "Save as PDF" with, taken from the print
 * document's title.
 *
 * Same shape as the web app's export (Name_Job_Title_Resume) so a file saved
 * from the panel and one saved from the editor sort together and are not
 * mistaken for different documents. The job's own title is preferred over the
 * resume's, since the resume was tailored FOR that posting.
 */
export function tailoredTitle(
  result: AnalysisResult,
  jobTitle?: string,
  kind: 'resume' | 'letter' = 'resume'
): string {
  const safe = (v: string) => v.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  const name = safe(result.optimizedResume?.fullName || 'Resume');
  const role = safe(jobTitle || result.optimizedResume?.jobTitle || 'Job');
  return `${name}_${role}_${kind === 'letter' ? 'Cover_Letter' : 'Resume'}`;
}
