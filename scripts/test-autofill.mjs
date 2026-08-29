import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

/**
 * Builds a mock application form and runs the real autofill module against it.
 *
 * The form deliberately mixes the shapes real ATSs use — a <label for>, a
 * wrapping label, a div-with-class label, bare placeholders, a select, and a
 * password field that must never be touched — so detection is exercised
 * against markup variety rather than one tidy example.
 *
 *   node scripts/test-autofill.mjs      # writes extension/autofill-test.html
 *
 * Open it and click "Run autofill" to see what is detected, what is filled,
 * and what is deliberately left for the user.
 */
const root = path.resolve(import.meta.dirname, '..');

const bundle = await esbuild.build({
  entryPoints: [path.join(root, 'extension/src/autofill.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'AF', target: 'es2020',
});

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Autofill test — mock application form</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  body { font-family: "Plus Jakarta Sans", system-ui, sans-serif; background:#f8fafc;
    margin:0; padding:40px; color:#0f172a; }
  .wrap { display:flex; gap:32px; align-items:flex-start; max-width:1180px; }
  form { background:#fff; padding:32px; border-radius:20px; flex:1;
    box-shadow:0 8px 30px rgba(15,23,42,.06); }
  h1 { font-size:22px; margin:0 0 4px; font-weight:800; }
  .sub { color:#94a3b8; font-size:13px; margin:0 0 24px; }
  label, .fieldlabel { display:block; font-size:11px; font-weight:800; text-transform:uppercase;
    letter-spacing:.08em; color:#64748b; margin:16px 0 5px; }
  input, textarea, select { width:100%; padding:10px 12px; border:1px solid #e2e8f0;
    border-radius:10px; font-family:inherit; font-size:13px; }
  textarea { min-height:90px; }
  button[type=submit] { margin-top:24px; background:#0f172a; color:#fff; border:0;
    padding:13px 26px; border-radius:12px; font-weight:800; cursor:pointer; }
  .out { width:420px; background:#0f172a; color:#e2e8f0; border-radius:20px; padding:22px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11.5px;
    line-height:1.65; white-space:pre-wrap; position:sticky; top:40px; max-height:88vh; overflow:auto; }
  .run { background:#4f46e5; color:#fff; border:0; padding:11px 20px; border-radius:11px;
    font-weight:800; cursor:pointer; font-family:"Plus Jakarta Sans",sans-serif; margin-bottom:16px; }
  .ok { color:#4ade80; } .no { color:#fb7185; } .dim { color:#64748b; }
</style></head>
<body>
<div class="wrap">
  <form onsubmit="event.preventDefault(); alert('Submitted — the extension must never cause this.');">
    <h1>Apply — Graduate Backend Engineer</h1>
    <p class="sub">Zephyr Tech · mock form covering the field shapes real ATSs use</p>

    <label for="fn">First name</label>
    <input id="fn" name="firstName" type="text">

    <label for="ln">Last name</label>
    <input id="ln" name="lastName" type="text">

    <label>Email address<input name="email" type="email"></label>

    <div class="fieldlabel">Mobile number</div>
    <input name="applicant_phone" type="tel">

    <label for="loc">Which city are you based in?</label>
    <input id="loc" type="text">

    <label for="li">LinkedIn profile</label>
    <input id="li" type="url">

    <div class="fieldlabel">Portfolio / GitHub</div>
    <input name="website" type="url">

    <label for="sal">What are your salary expectations?</label>
    <input id="sal" type="text">

    <label for="visa">Do you have the right to work in Australia?</label>
    <select id="visa">
      <option value="">Please select</option>
      <option>Yes — citizen or permanent resident</option>
      <option>Yes — valid work visa</option>
      <option>No — would need sponsorship</option>
    </select>

    <label for="rel">Are you willing to relocate?</label>
    <input id="rel" type="text">

    <label for="notice">What is your notice period / availability?</label>
    <input id="notice" type="text">

    <label for="cl">Cover letter — why do you want this role?</label>
    <textarea id="cl"></textarea>

    <label for="pw">Create a password for your candidate account</label>
    <input id="pw" type="password">

    <button type="submit">Submit application</button>
  </form>

  <div>
    <button class="run" onclick="run()">Run autofill</button>
    <div class="out" id="out">Click "Run autofill".</div>
  </div>
</div>

<script>${bundle.outputFiles[0].text}</script>
<script>
const profile = {
  userId: 'test', fullName: 'Wei Chen', email: 'wei@example.com', phone: '+61 4XX XXX XXX',
  city: 'Melbourne', country: 'Australia',
  linkedinUrl: 'https://linkedin.com/in/weichen', websiteUrl: 'https://github.com/weichen',
  workRights: 'Australian Permanent Resident',
  targetTitles: [], targetLocations: ['Melbourne VIC'], targetIndustries: [],
  languages: [], derivedSkills: [], confirmedFacts: [], workHistory: [], education: [],
  certifications: [], optionalDemographics: {}, savedAnswers: [], updatedAt: '',
};

function run() {
  const out = document.getElementById('out');
  const fields = AF.detectFields(profile, 'Dear Hiring Manager, ...');

  const lines = ['DETECTED ' + fields.length + ' FIELD(S)', ''];
  for (const f of fields) {
    lines.push((f.highStakes ? '<span class="no">[you answer]</span> ' : '<span class="ok">[fill]      </span> ')
      + f.kind.padEnd(13) + ' <span class="dim">' + (f.value ? f.value.slice(0, 34) : '—') + '</span>');
  }

  const before = document.getElementById('pw').value;
  const n = AF.fillFields(fields);
  const after = document.getElementById('pw').value;

  lines.push('', 'FILLED: ' + n);
  lines.push('');
  lines.push('CHECKS');
  const salary = document.getElementById('sal').value;
  const visa = document.getElementById('visa').value;
  const rel = document.getElementById('rel').value;
  const notice = document.getElementById('notice').value;
  const chk = (label, pass) => (pass ? '<span class="ok">PASS</span> ' : '<span class="no">FAIL</span> ') + label;
  // Assert DETECTED-AND-EMPTY, not merely empty: a high-stakes question that
  // was never recognised is also empty, and that is a failure wearing a pass.
  const detected = (k) => fields.some((f) => f.kind === k);
  const guarded = (k, v) => detected(k) && v === '';
  lines.push(chk('salary detected + left empty', guarded('salary', salary)));
  lines.push(chk('visa detected + left empty', guarded('visa', visa)));
  lines.push(chk('relocation detected + left empty', guarded('relocation', rel)));
  lines.push(chk('availability detected + left empty', guarded('availability', notice)));
  lines.push(chk('password untouched', before === after && after === ''));
  lines.push(chk('name/email/phone filled',
    document.getElementById('fn').value === 'Wei Chen'.split(' ')[0]
    && document.querySelector('[name=email]').value === 'wei@example.com'
    && document.querySelector('[name=applicant_phone]').value !== ''));
  out.innerHTML = lines.join('\\n');
}
</script>
</body></html>`;

const out = path.join(root, 'extension', 'autofill-test.html');
fs.writeFileSync(out, html);
console.log(`Autofill test page -> ${path.relative(root, out)}`);
