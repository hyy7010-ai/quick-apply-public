import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

/**
 * A clickable demo of the real panel, without installing the extension.
 *
 * This bundles the actual content script and runs it against a mock job page,
 * with `chrome.runtime.sendMessage` stubbed to return canned data instead of
 * hitting the network. Everything else — JD extraction, the panel, scoring
 * display, template switching, PDF printing, autofill — is the code that ships.
 *
 *   node scripts/demo-panel.mjs
 *
 * Useful for reviewing behaviour and design. It cannot tell you whether the
 * site adapters work on a real SEEK or LinkedIn page; only installing the
 * extension can.
 */
const root = path.resolve(import.meta.dirname, '..');

// node scripts/demo-panel.mjs zh  -> renders the panel in Chinese, the way it
// behaves for someone who picked 中文 in the web app.
const demoLang = process.argv[2] === 'zh' ? 'zh' : 'en';

const bundle = await esbuild.build({
  entryPoints: [path.join(root, 'extension/src/content-job.ts')],
  bundle: true, write: false, format: 'iife', target: 'es2020',
});

const JD = `We're hiring a Graduate Backend Engineer to join our platform team in Melbourne.

You will build and maintain Python services, write SQL against our PostgreSQL warehouse, help containerise services with Docker, and collaborate with frontend engineers on API design.

Required: a Bachelor's degree in Computer Science or similar completed within the last two years; solid Python; working knowledge of relational databases; full Australian working rights. Hybrid — three days a week in our Collins St office.

Nice to have: exposure to Docker or Kubernetes, any React experience, prior internship in a data-heavy environment.`;

const RESUME = {
  fullName: 'Wei Chen', jobTitle: 'Graduate Backend Engineer',
  contactInfo: 'Melbourne VIC | wei@example.com | linkedin.com/in/weichen',
  summary: 'Recent Computer Science graduate with hands-on backend and data engineering experience in Python and PostgreSQL. Australian Permanent Resident.',
  technicalSkills: ['Python', 'SQL', 'PostgreSQL', 'Docker', 'React', 'Git', 'Linux'],
  softSkills: ['Collaboration', 'Written communication'],
  education: [{ id: 'e1', school: 'Monash University', degree: 'BSc Computer Science', startDate: '2022', endDate: '2025', gpa: 'WAM 78' }],
  awards: ['AWS Certified Cloud Practitioner (2025)'],
  experiences: [
    { id: 'x1', role: 'Backend Engineering Intern', company: 'DataCo Pty Ltd', period: 'Jan 2025 – Jul 2025', isMatch: true,
      bullets: ['Built Python ETL pipelines processing 2 million rows per day into PostgreSQL',
                'Cut nightly batch runtime from 4 hours to 50 minutes by rewriting the heaviest queries',
                'Containerised three platform services with Docker for the platform team'] },
    { id: 'x2', role: 'Casual Teaching Associate', company: 'Monash University', period: 'Mar 2024 – Nov 2024', isMatch: false,
      bullets: ['Ran weekly algorithms tutorials for 25 students', 'Marked assignments and gave written feedback'] },
  ],
  schoolProjects: [{ id: 'p1', role: 'Booking Platform (Capstone)', company: 'React · FastAPI · PostgreSQL', period: '2025', isMatch: true, bullets: ['Scored High Distinction'] }],
  volunteer: [], references: [],
};

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Career Agent — interactive demo</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  body { margin:0; background:#fff; font-family:"Plus Jakarta Sans",system-ui,sans-serif; color:#0f172a; }
  .bar { background:#0f172a; color:#94a3b8; padding:10px 28px; font-size:12px; font-weight:700; }
  .bar b { color:#fff; }
  .page { max-width:760px; padding:44px 28px 120px; }
  h1 { font-size:30px; font-weight:800; margin:0 0 6px; letter-spacing:-.02em; }
  .meta { color:#64748b; font-size:14px; font-weight:600; margin:0 0 28px; }
  [data-automation="jobAdDetails"] { font-size:15px; line-height:1.8; color:#334155; }
  [data-automation="jobAdDetails"] p { margin:0 0 16px; }
  form { margin-top:56px; border-top:1px solid #e2e8f0; padding-top:32px; }
  h2 { font-size:20px; font-weight:800; margin:0 0 20px; }
  label,.fl { display:block; font-size:11px; font-weight:800; text-transform:uppercase;
    letter-spacing:.08em; color:#64748b; margin:18px 0 6px; }
  input,textarea,select { width:100%; padding:11px 13px; border:1px solid #e2e8f0;
    border-radius:11px; font-family:inherit; font-size:14px; }
  textarea { min-height:110px; }
  button[type=submit] { margin-top:26px; background:#0f172a; color:#fff; border:0;
    padding:14px 30px; border-radius:13px; font-weight:800; cursor:pointer; font-size:14px; }
</style></head>
<body>
<div class="bar">DEMO &nbsp;·&nbsp; <b>mock job page</b> &nbsp;·&nbsp; the panel on the right is the real extension code, with network calls stubbed</div>

<div class="page">
  <h1 data-automation="job-detail-title">Graduate Backend Engineer</h1>
  <p class="meta">
    <span data-automation="advertiser-name">Zephyr Tech</span> ·
    <span data-automation="job-detail-location">Melbourne VIC</span> ·
    <span data-automation="job-detail-salary">$75,000 – $88,000 + super</span> ·
    <span data-automation="job-detail-work-type">Full time</span>
  </p>
  <div data-automation="jobAdDetails">${JD.split('\n\n').map((p) => `<p>${p}</p>`).join('')}</div>

  <form onsubmit="event.preventDefault(); alert('You pressed Submit. The extension never does this for you.');">
    <h2>Apply for this job</h2>
    <label for="fn">First name</label><input id="fn" type="text">
    <label for="ln">Last name</label><input id="ln" type="text">
    <label>Email address<input name="email" type="email"></label>
    <div class="fl">Mobile number</div><input name="applicant_phone" type="tel">
    <label for="loc">Which city are you based in?</label><input id="loc" type="text">
    <label for="li">LinkedIn profile</label><input id="li" type="url">
    <div class="fl">Portfolio / GitHub</div><input name="website" type="url">
    <label for="sal">What are your salary expectations?</label><input id="sal" type="text">
    <label for="visa">Do you have the right to work in Australia?</label>
    <select id="visa"><option value="">Please select</option>
      <option>Yes — citizen or permanent resident</option>
      <option>Yes — valid work visa</option>
      <option>No — would need sponsorship</option></select>
    <label for="rel">Are you willing to relocate?</label><input id="rel" type="text">
    <label for="notice">Notice period / availability?</label><input id="notice" type="text">
    <label for="cl">Cover letter — why do you want this role?</label><textarea id="cl"></textarea>
    <label for="pw">Create a password</label><input id="pw" type="password">
    <button type="submit">Submit application</button>
  </form>
</div>

<script>
// --- Stub the extension APIs the content script expects -------------------
const PROFILE = {
  userId: 'demo', fullName: 'Wei Chen', headline: 'CS grad, backend focus',
  email: 'wei@example.com', phone: '+61 4XX XXX XXX', city: 'Melbourne', country: 'Australia',
  linkedinUrl: 'https://linkedin.com/in/weichen', websiteUrl: 'https://github.com/weichen',
  targetTitles: ['Graduate Backend Engineer'], targetLocations: ['Melbourne VIC'],
  targetIndustries: ['Technology'], seniority: 'Graduate', workRights: 'Australian Permanent Resident',
  salaryMin: 70000, salaryMax: 85000, salaryCurrency: 'AUD', remotePreference: 'hybrid',
  languages: ['English','Mandarin'], derivedSkills: [], confirmedFacts: [],
  workHistory: [], education: [], certifications: [], optionalDemographics: {},
  savedAnswers: [], updatedAt: new Date().toISOString(),
};

const SNAPSHOT = {
  id: 1, userId: 'demo', jobId: 1, careerProfileSnapshot: PROFILE, createdAt: new Date().toISOString(),
  overallScore: 96, recommendedAction: 'priority_apply', hardGaps: [],
  scoreBreakdown: {
    hardRequirements: { score:100, weight:.35, notes:'AU work rights, recent CS degree, based in Melbourne' },
    skillsExperience: { score:95, weight:.35, notes:'Python and PostgreSQL both covered by the internship' },
    goalsPreferences: { score:100, weight:.15, notes:'Exact title, location and hybrid arrangement match' },
    opportunityQuality:{ score:85, weight:.15, notes:'Specific JD with stack, salary band and office days' },
    historicalOutcomes:{ score:0, weight:0, notes:'No outcome history yet.' },
  },
};

const TAILORED = { id: 7, content: {
  overallScore: 91, missingSkills: ['Kubernetes'],
  coverLetter: 'Dear Hiring Manager,\\n\\nI am applying for the Graduate Backend Engineer role at Zephyr Tech. During a six-month backend internship at DataCo I built Python ETL pipelines that moved two million rows a day into PostgreSQL, and cut the nightly batch from four hours to fifty minutes by rewriting the heaviest queries.\\n\\nYour advert asks for Python, relational databases and Docker. Those are the three things I spent that internship doing, and I containerised three of the platform team\\'s services before I left.\\n\\nI hold Australian permanent residency and I am based in Melbourne, so the three days a week on Collins St suit me.\\n\\nSincerely,\\nWei Chen',
  optimizedResume: ${JSON.stringify(RESUME)},
}};

const DEMO_LANG = '${demoLang}';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

window.chrome = {
  runtime: {
    async sendMessage(req) {
      switch (req.type) {
        case 'ANALYSE_JOB':
          await delay(500);
          return { ok: true, data: { job: { id: 1, userId: 'demo', ...req.job, isStale:false,
            capturedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            profile: PROFILE, snapshot: null, lang: DEMO_LANG } };
        case 'SCORE':
          await delay(1400);
          return { ok: true, data: { snapshot: SNAPSHOT } };
        case 'TAILOR':
          await delay(1800);
          return { ok: true, data: TAILORED };
        case 'SAVE_APPLICATION':
          await delay(500);
          return { ok: true, data: null };
        case 'OPEN_APP':
          alert('Would open the FastResume web app.');
          return { ok: true, data: null };
        default:
          return { ok: false, error: 'UNKNOWN_REQUEST' };
      }
    },
    getURL: (p) => p,
  },
};
</script>
<script>${bundle.outputFiles[0].text}</script>
</body></html>`;

const out = path.join(root, 'extension', 'panel-demo.html');
fs.writeFileSync(out, html);
console.log(`Interactive panel demo (${demoLang}) -> ${path.relative(root, out)}`);
