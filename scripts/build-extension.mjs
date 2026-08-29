import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

/**
 * Builds the Chrome extension into extension/dist/, ready to load unpacked.
 *
 * Config comes from the same .env the web app uses, injected as compile-time
 * constants. Only public values are baked in (API origin, Supabase URL, anon
 * key); the service role and Gemini keys stay server-side, since every AI call
 * goes through /api/gemini rather than direct to a provider.
 */

const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(root, 'extension', 'dist');
const publicDir = path.join(root, 'extension', 'public');

const apiOrigin = process.env.EXTENSION_API_ORIGIN || 'http://localhost:3000';
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

await esbuild.build({
  entryPoints: {
    background: path.join(root, 'extension/src/background.ts'),
    'content-job': path.join(root, 'extension/src/content-job.ts'),
    'content-auth': path.join(root, 'extension/src/content-auth.ts'),
    popup: path.join(root, 'extension/src/popup.ts'),
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  // Keep it readable while the extension is still being debugged by hand.
  minify: false,
  sourcemap: false,
  define: {
    __API_ORIGIN__: JSON.stringify(apiOrigin),
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __SUPABASE_ANON_KEY__: JSON.stringify(anonKey),
  },
});

// Static files: manifest, popup shell, icons.
for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
  const from = path.join(publicDir, entry.name);
  const to = path.join(outdir, entry.name);
  if (entry.isDirectory()) fs.cpSync(from, to, { recursive: true });
  else fs.copyFileSync(from, to);
}

// The manifest lists a CSS file for the job content script; panel styles are
// injected into the shadow root instead, so ship an empty file rather than
// letting Chrome fail to load the extension over a missing resource.
fs.writeFileSync(path.join(outdir, 'panel.css'), '/* styles live in the shadow root, see panel-styles.ts */\n');

// Strip the explanatory "comment" keys — Chrome rejects unknown manifest keys.
const manifestPath = path.join(outdir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const cs of manifest.content_scripts || []) delete cs.comment;
// Point host_permissions at whatever origin this build talks to.
if (!manifest.host_permissions.some((h) => h.startsWith(apiOrigin))) {
  manifest.host_permissions.push(`${apiOrigin}/*`);
}
manifest.host_permissions.push(`${supabaseUrl}/*`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`Extension built -> ${path.relative(root, outdir)}`);
console.log(`  API origin : ${apiOrigin}`);
console.log(`  Supabase   : ${supabaseUrl}`);
console.log('\nLoad it: chrome://extensions -> Developer mode -> Load unpacked -> select that folder');
