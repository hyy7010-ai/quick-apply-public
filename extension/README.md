# FastResume Career Agent — Chrome Extension

The "hands" half of the product: read the job you're already looking at, see how
well it actually fits, and tailor your resume for it — without leaving the page.

**Scope of this version:** read JD → explainable match score → tailored resume +
cover letter → autofill the application form → save to Applications.
**No auto-submit — you always press the button yourself.**

---

## What it does

| | |
|---|---|
| Reads the current job ad | SEEK · LinkedIn · Indeed · BOSS直聘 · 猎聘 · 智联 · 前程无忧 · company career pages |
| Scores it | Same five-dimension explainable match as the web app |
| Tailors a resume | Rewrites your existing resume for this JD; never invents experience |
| Fills the form | Name, contact, location, links, cover letter — after you review what it will write |
| Saves it | Job, match snapshot and resume version all land in your account |

It shares **one account, one profile and one database** with the web app. It
does not keep its own copy of anything.

---

## Install (development)

```bash
npm run build:ext
```

Then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select `extension/dist`
4. Copy the extension ID Chrome shows on the card

### Then allow the extension to call your API

The server rejects cross-origin calls from anywhere not on its allowlist, and a
freshly loaded extension has an ID you cannot know in advance. Add it to `.env`:

```
ALLOWED_ORIGINS=chrome-extension://<the-id-you-just-copied>
```

Restart the dev server afterwards. Without this the panel appears but every
action fails with a network error.

> The ID changes each time you load the unpacked folder from a new path. It
> becomes stable once the extension is published, or if you pin it with a `key`
> in the manifest.

---

## Using it

1. Open FastResume and **sign in once**. The extension picks up that session
   automatically — there is no separate login.
2. Open a job ad on a supported site.
3. A handle appears on the right edge. Click it to open the panel.
4. Scoring and tailoring each cost credits, and both are behind an explicit
   click — the panel never spends your balance just because you opened a page.

Check the toolbar popup if the panel says you're signed out; it reports whether
the session was picked up.

---

## How it is put together

```
src/
  config.ts         API origin + Supabase config, injected at build time
  adapters.ts       Per-site JD extractors, with a generic fallback
  api.ts            PostgREST + /api/gemini calls using the user's own JWT
  background.ts     Service worker — all network and storage work
  content-auth.ts   Runs on FastResume's pages, harvests the session
  content-job.ts    Runs on job pages, extracts the JD, renders the panel
  autofill.ts       Form field detection and filling
  panel-styles.ts   Panel CSS (injected into a shadow root)
  popup.ts          Toolbar popup: sign-in status
```

A few decisions worth knowing about:

**The scoring prompt is shared, not copied.** Both the extension and the web app
import `services/career/matchPrompt.ts`. If the extension had its own copy, the
same job would eventually score differently depending on where you were
standing.

**Auth is borrowed, not rebuilt.** A content script on FastResume's own origin
reads the session supabase-js already stored there. That avoids running an OAuth
flow inside an extension whose ID changes between loads, and guarantees the two
halves are the same account.

**The panel lives in a shadow root.** Job boards ship aggressive global CSS;
without isolation the panel inherits whatever LinkedIn sets on `div` and
`button`, and our styles leak onto their page.

**Network calls happen in the service worker, not the content script.** MV3
content scripts inherit the host page's CSP, which on several job boards would
block calls to our own API outright.

**Site selectors will break.** Every extractor falls back to a generic reader
that picks the densest text block on the page, so a site redesign degrades
extraction quality instead of breaking the extension.

**Templates are ported, not shared.** The layouts in `ResumePreview.tsx` are
React components defined inside that component's closure — they read its
pagination state and inline-editing wrappers. Reusing them would mean bundling
React into a content script *and* lifting five layouts out of a 113KB working
file. The visual design is replicated in CSS in `resume-view.ts` instead. The
cost: a template change on the web app has to be mirrored here. Three of the
five are ported (Minimalist, Professional, Creative); Academic and Grid are
dense enough to need the full editor, so the panel links to the web app for
those rather than shipping a cramped imitation.

**Autofill never submits and never guesses.** The module locates and writes
input fields; it does not look for, focus or click submit controls, and it
never dispatches a submit event. Salary, visa status, relocation and
availability are detected and shown but left blank — a wrong answer there
cannot be taken back once the form is sent, and the right answer is usually
specific to that one employer. Password, payment and file fields are skipped
entirely.

**Field matching is label-driven, not selector-driven.** Reading a field's
label, `autocomplete`, `name`, `id`, `placeholder` and `aria-label` works
across ATSs that share no markup and survives redesigns that would break a CSS
selector. A container's label is only trusted when that container holds exactly
one control — an earlier version walked up to any ancestor `div` and took its
first `<label>`, which on a normal form is the *form's* first label, so every
field described itself as "First name". That would have typed the wrong value
into a real application.

**Pages are real A4.** The sheet is a 210×297mm box scaled to the panel width
with a CSS transform, and print resets the scale to 1. What is on screen has
the same proportions and line breaks as the file that comes out.

---

## Reviewing the design without installing

```bash
node scripts/preview-panel.mjs                    # match view
node scripts/preview-panel.mjs doc                # document view
node scripts/preview-panel.mjs doc Creative       # a specific template
```

Writes `extension/panel-preview.html`. The stylesheet *and* the resume markup
are pulled from the extension's own modules (bundled on the fly), so the
preview cannot drift from what the panel actually renders.

---

## Testing autofill

```bash
node scripts/test-autofill.mjs
```

Writes `extension/autofill-test.html`: a mock application form mixing the field
shapes real ATSs use (label-for, wrapping label, div-as-label, bare
placeholder, select, password) with the real autofill module bundled in. Click
"Run autofill" to see what is detected, what is filled, and what is left for
you. The safety checks assert *detected-and-empty* for high-stakes fields
rather than merely empty — a question that was never recognised is also empty,
and that is a failure wearing a pass.

---

## Not done yet

- Real icon artwork — `public/icons/*.png` are placeholders
- Verification against live job pages: the extension builds and the panel
  renders, but the extractors have not been run against real SEEK/LinkedIn/
  BOSS直聘 pages yet. Expect selector tuning on first use.
