import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

/**
 * Renders the extension panel into a standalone HTML file with sample data.
 *
 * The stylesheet AND the resume markup come from the extension's own modules
 * (bundled on the fly), so the preview cannot drift from what the extension
 * actually shows.
 *
 *   node scripts/preview-panel.mjs            # match view
 *   node scripts/preview-panel.mjs doc        # document view
 *   node scripts/preview-panel.mjs doc Creative
 */
const root = path.resolve(import.meta.dirname, '..');
const mode = process.argv[2] === 'doc' ? 'doc' : 'main';
const template = process.argv[3] || 'Minimalist';

const panelSrc = fs.readFileSync(path.join(root, 'extension/src/panel-styles.ts'), 'utf8');
const panelCss = panelSrc.slice(panelSrc.indexOf('`') + 1, panelSrc.lastIndexOf('`'));

// Bundle the real renderer so the preview uses the same functions the panel does.
const bundled = await esbuild.build({
  entryPoints: [path.join(root, 'extension/src/resume-view.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'RV', target: 'es2020',
});
const rvJs = bundled.outputFiles[0].text;
const { RESUME_VIEW_CSS, resumeHtml, coverLetterHtml, PANEL_TEMPLATES } =
  new Function(`${rvJs}; return RV;`)();

const resume = {
  fullName: 'Wei Chen', jobTitle: 'Graduate Backend Engineer',
  contactInfo: 'Melbourne VIC | wei@example.com | linkedin.com/in/weichen',
  summary: 'Recent Computer Science graduate with hands-on backend and data engineering experience in Python and PostgreSQL. Australian Permanent Resident.',
  technicalSkills: ['Python', 'SQL', 'PostgreSQL', 'Docker', 'React', 'Git', 'Linux'],
  softSkills: ['Collaboration', 'Written communication'],
  education: [{ school: 'Monash University', degree: 'BSc Computer Science', startDate: '2022', endDate: '2025', gpa: 'WAM 78' }],
  awards: ['AWS Certified Cloud Practitioner (2025)'],
  experiences: [
    { role: 'Backend Engineering Intern', company: 'DataCo Pty Ltd', period: 'Jan 2025 – Jul 2025',
      bullets: ['Built Python ETL pipelines processing 2 million rows per day into PostgreSQL',
                'Cut nightly batch runtime from 4 hours to 50 minutes by rewriting the heaviest queries',
                'Containerised three platform services with Docker for the platform team'] },
    { role: 'Casual Teaching Associate', company: 'Monash University', period: 'Mar 2024 – Nov 2024',
      bullets: ['Ran weekly algorithms tutorials for 25 students', 'Marked assignments and gave written feedback'] },
  ],
  schoolProjects: [{ role: 'Booking Platform (Capstone)', company: 'React · FastAPI · PostgreSQL', period: '2025', bullets: ['Scored High Distinction'] }],
  volunteer: [], references: [],
};

const dims = [
  ['Hard requirements', 35, 100, 'AU work rights, recent CS degree, based in Melbourne'],
  ['Skills &amp; experience', 35, 95, 'Python and PostgreSQL both covered by the internship'],
  ['Goals &amp; preferences', 15, 100, 'Exact title, location and hybrid match'],
  ['Opportunity quality', 15, 85, 'Specific JD with stack, salary band and office days'],
];

const MAIN_BODY = `
  <div class="fr-job">
    <p class="fr-job-title">Graduate Backend Engineer</p>
    <p class="fr-job-company">Zephyr Tech</p>
    <p class="fr-job-meta">Melbourne VIC</p>
  </div>
  <div class="fr-score">
    <div class="fr-score-head">
      <div><p class="fr-label">Career Fit</p><p class="fr-score-num">96<span>%</span></p></div>
      <span class="fr-chip fr-good">Priority apply</span>
    </div>
    <div class="fr-dims">${dims.map(([l, w, s, n]) => `<div class="fr-dim">
      <div class="fr-dim-head"><span class="fr-dim-label">${l} <span class="fr-dim-weight">${w}%</span></span><span class="fr-dim-score">${s}</span></div>
      <div class="fr-bar"><div class="fr-bar-fill" style="width:${s}%"></div></div>
      <p class="fr-dim-notes">${n}</p></div>`).join('')}</div>
  </div>
  <button class="fr-btn fr-wide">Tailor my resume for this · 2</button>
  <button class="fr-btn fr-ghost fr-wide">Save to Applications</button>`;

const DOC_BODY = `
  <div class="fr-doc-bar">
    <button class="fr-link">&larr; Back</button>
    <div class="fr-doc-tabs">
      <button class="fr-doc-tab on">Resume</button>
      <button class="fr-doc-tab">Cover letter</button>
    </div>
  </div>
  <div class="fr-tpl-bar">
    <span class="fr-label">Template</span>
    <div class="fr-tpls">${PANEL_TEMPLATES.map((t) =>
      `<button class="fr-tpl ${t.value === template ? 'on' : ''}">${t.label}</button>`).join('')}</div>
  </div>
  <div class="fr-sheet-wrap"><div class="rv-sheet">${resumeHtml(resume, template)}</div></div>
  <div class="fr-doc-actions">
    <button class="fr-btn fr-primary">Download PDF</button>
    <button class="fr-btn">Copy text</button>
    <button class="fr-btn fr-ghost">More templates</button>
  </div>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Career Agent panel preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<style>
body { margin:0; min-height:100vh; background:#f8fafc; font-family:"Plus Jakarta Sans",sans-serif; }
.host { padding:48px; max-width:520px; }
.host h1 { font-size:26px; font-weight:800; margin:0 0 8px; color:#0f172a; }
.host p { color:#94a3b8; line-height:1.75; font-size:14px; }
.note { color:#cbd5e1; font-size:12px; margin-top:28px; }
${panelCss.replace(':host, * { box-sizing: border-box; }', '* { box-sizing: border-box; }')}
${RESUME_VIEW_CSS}
</style></head>
<body>
<div class="host">
  <h1>Graduate Backend Engineer</h1>
  <p>Zephyr Tech · Melbourne VIC · Hybrid</p>
  <p>We're hiring a Graduate Backend Engineer to join our platform team. Required: a CS degree
  completed in the last two years, solid Python, and full Australian working rights.</p>
  <p class="note">↑ 模拟的招聘网站页面 &nbsp;·&nbsp; 右侧为插件浮窗</p>
</div>

<aside class="fr-panel${mode === 'doc' ? ' fr-wide-panel' : ''}">
  <header class="fr-head">
    <span class="fr-brand">FastResume <b>Career Agent</b></span>
    <button class="fr-close">&times;</button>
  </header>
  <div class="fr-body">${mode === 'doc' ? DOC_BODY : MAIN_BODY}</div>
</aside>
<script>
  // Same scaling the panel does after render.
  const wrap = document.querySelector('.fr-sheet-wrap');
  const sheet = wrap && wrap.querySelector('.rv-sheet');
  if (wrap && sheet) {
    const s = Math.min(1, wrap.clientWidth / sheet.offsetWidth);
    sheet.style.setProperty('--rv-scale', String(s));
    wrap.style.height = (sheet.offsetHeight * s) + 'px';
  }
</script>
</body></html>`;

const out = path.join(root, 'extension', 'panel-preview.html');
fs.writeFileSync(out, html);
console.log(`Panel preview (${mode}${mode === 'doc' ? ', ' + template : ''}) -> ${path.relative(root, out)}`);
