/**
 * Panel CSS, kept as a string so it can be injected into the shadow root.
 *
 * Everything is scoped inside the shadow tree, so the host page's stylesheet
 * cannot reach these rules and these rules cannot escape onto the job board.
 * Font stack mirrors the web app (Plus Jakarta Sans, with fallbacks — the
 * extension does not load remote fonts).
 */
export const PANEL_STYLES = `
:host, * { box-sizing: border-box; }

.fr-tab, .fr-panel {
  position: fixed;
  z-index: 2147483647;
  font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #0f172a;
}

/* Collapsed handle */
.fr-tab {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 16px 9px;
  border: 0;
  border-radius: 16px 0 0 16px;
  background: linear-gradient(160deg, #6366f1, #4f46e5 55%, #7c3aed);
  color: #fff;
  cursor: pointer;
  box-shadow: -6px 0 24px rgba(79, 70, 229, 0.35);
  transition: filter .25s ease, padding .25s ease, box-shadow .25s ease;
}
.fr-tab:hover {
  filter: brightness(1.08);
  padding-right: 13px;
  box-shadow: -8px 0 28px rgba(79, 70, 229, 0.45);
}
/* vertical-rl reads top-to-bottom on the right edge, which is the direction
   the eye already travels down a page edge. text-orientation mixed keeps the
   Latin letters rotated as one word rather than stacking them one per line.
   No backticks in here: this whole stylesheet is a TS template literal. */
.fr-tab-mark {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .16em;
  white-space: nowrap;
}
.fr-tab-score {
  font-size: 12px;
  font-weight: 800;
  color: #e0e7ff;
  writing-mode: horizontal-tb;
}

/* Panel */
.fr-panel {
  top: 0;
  right: 0;
  width: 380px;
  max-width: 96vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -18px 0 48px rgba(15, 23, 42, .14);
  transition: transform .32s cubic-bezier(.4, 0, .2, 1);
}
.fr-collapsed { transform: translateX(100%); }

.fr-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0;
}
.fr-brand { font-size: 12px; font-weight: 600; color: #64748b; letter-spacing: .01em; }
.fr-brand b { color: #0f172a; font-weight: 800; }
.fr-close {
  border: 0; background: transparent; font-size: 22px; line-height: 1;
  color: #cbd5e1; cursor: pointer; padding: 0 4px;
}
.fr-close:hover { color: #0f172a; }

.fr-body { padding: 20px; overflow-y: auto; flex: 1; }
.fr-body > * + * { margin-top: 14px; }

/* Job header */
.fr-job-title { margin: 0; font-size: 17px; font-weight: 800; line-height: 1.3; }
.fr-job-company { margin: 4px 0 0; font-size: 13px; color: #64748b; font-weight: 500; }
.fr-job-meta { margin: 6px 0 0; font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .1em; color: #cbd5e1; }

/* Score block */
.fr-score { border: 1px solid #f1f5f9; border-radius: 22px; padding: 18px;
  background: linear-gradient(160deg, #f8fafc, #fff); }
.fr-score-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.fr-label { margin: 0 0 2px; font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .12em; color: #94a3b8; }
.fr-label-bad { color: #fda4af; }
.fr-score-num { margin: 0; font-size: 42px; font-weight: 800; letter-spacing: -.03em;
  line-height: 1; font-variant-numeric: tabular-nums; }
.fr-score-num span { font-size: 18px; color: #cbd5e1; }

.fr-chip { padding: 5px 10px; border-radius: 9px; font-size: 10px; font-weight: 800;
  text-transform: uppercase; letter-spacing: .08em; border: 1px solid; }
.fr-good { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.fr-ok   { background: #eef2ff; color: #4f46e5; border-color: #c7d2fe; }
.fr-warn { background: #fffbeb; color: #b45309; border-color: #fde68a; }
.fr-bad  { background: #fff1f2; color: #e11d48; border-color: #fecdd3; }

.fr-dims { margin-top: 16px; }
.fr-dims > * + * { margin-top: 13px; }
.fr-dim-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.fr-dim-label { font-size: 10px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .07em; color: #64748b; }
.fr-dim-weight { color: #cbd5e1; }
.fr-dim-score { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.fr-bar { height: 7px; border-radius: 99px; background: #f1f5f9; overflow: hidden; margin-top: 6px; }
.fr-bar-fill { height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, #6366f1, #8b5cf6); transition: width .7s ease; }
.fr-dim-notes { margin: 6px 0 0; font-size: 11.5px; line-height: 1.5; color: #94a3b8; }

.fr-gaps { margin-top: 16px; padding: 14px; border-radius: 16px;
  background: rgba(255, 241, 242, .6); border: 1px solid #fecdd3; }
.fr-gaps ul { margin: 0; padding-left: 16px; }
.fr-gaps li { font-size: 11.5px; line-height: 1.55; color: #be123c; font-weight: 500; }

/* Buttons */
.fr-btn {
  border: 1px solid #e2e8f0; background: #fff; color: #0f172a;
  padding: 12px 16px; border-radius: 16px; font-size: 12.5px; font-weight: 800;
  cursor: pointer; transition: all .25s ease; font-family: inherit;
}
.fr-btn:hover:not(:disabled) { border-color: #cbd5e1; transform: translateY(-1px); }
.fr-btn:disabled { opacity: .45; cursor: default; }
.fr-wide { display: block; width: 100%; }
.fr-primary { background: #0f172a; color: #fff; border-color: #0f172a;
  box-shadow: 0 8px 20px rgba(15, 23, 42, .12); }
.fr-primary:hover:not(:disabled) { background: #4f46e5; border-color: #4f46e5;
  box-shadow: 0 10px 26px rgba(79, 70, 229, .28); }
.fr-ghost { border-style: dashed; color: #64748b; }

.fr-link { border: 0; background: none; color: #4f46e5; font-weight: 800;
  font-size: 11.5px; cursor: pointer; padding: 0; margin-left: 6px; font-family: inherit; }

.fr-done { font-size: 11.5px; font-weight: 600; color: #047857;
  background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 14px; padding: 11px 13px; }

/* Document view — widens the panel so a resume is readable in place */
.fr-wide-panel { width: 860px; }
.fr-doc-bar { display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 14px; }
.fr-doc-tabs { display: flex; gap: 4px; background: #f1f5f9; padding: 3px; border-radius: 12px; }
.fr-doc-tab { border: 0; background: transparent; padding: 6px 13px; border-radius: 9px;
  font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
  color: #94a3b8; cursor: pointer; font-family: inherit; }
.fr-doc-tab.on { background: #fff; color: #4f46e5; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
.fr-tpl-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.fr-tpl-bar .fr-label { margin: 0; }
.fr-tpls { display: flex; gap: 4px; }
.fr-tpl { border: 1px solid #e2e8f0; background: #fff; padding: 5px 11px; border-radius: 9px;
  font-size: 10px; font-weight: 800; color: #94a3b8; cursor: pointer; font-family: inherit;
  transition: all .2s ease; }
.fr-tpl:hover { border-color: #c7d2fe; color: #4f46e5; }
.fr-tpl.on { background: #0f172a; border-color: #0f172a; color: #fff; }
/* The A4 sheet is scaled with a transform, which does not affect layout, so
   the wrapper's height is set from JS after each render. */
.fr-sheet-wrap { overflow: hidden; border-radius: 10px; }
.fr-doc-actions { display: flex; gap: 8px; margin-top: 14px; position: sticky; bottom: 0;
  background: #fff; padding-top: 12px; }
.fr-doc-actions .fr-btn { flex: 1; }

/* Autofill review */
.fr-fill-group { border: 1px solid #f1f5f9; border-radius: 18px; padding: 14px; }
.fr-fill-group.ask-group { border-color: #fecdd3; background: rgba(255,241,242,.45); }
.fr-fill-group .fr-label { margin-bottom: 10px; }
.fr-fill-row { display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; padding: 7px 0; border-top: 1px solid #f8fafc; }
.fr-fill-row:first-of-type { border-top: 0; }
.fr-fill-kind { font-size: 11px; font-weight: 800; }
.fr-fill-note { font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: #cbd5e1; margin-left: 6px; }
.fr-fill-v { font-size: 11.5px; color: #64748b; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; }
.fr-fill-ask { color: #e11d48; font-weight: 800; font-size: 10px;
  text-transform: uppercase; letter-spacing: .06em; }
.fr-note { font-size: 11.5px; font-weight: 600; color: #b45309;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 14px; padding: 11px 13px; }
.fr-fill-why { font-size: 10.5px; line-height: 1.6; color: #94a3b8; margin: 10px 0 0; }

/* Empty / error states */
.fr-empty { text-align: center; padding: 26px 12px; }
.fr-empty-title { margin: 0 0 6px; font-size: 15px; font-weight: 800; }
.fr-empty-sub { margin: 0 0 16px; font-size: 12.5px; line-height: 1.6; color: #64748b; }
.fr-err { color: #e11d48; }

/* Career Profile form — the short half, filled without leaving the job page. */
.fr-form { padding: 4px 0 8px; }
.fr-f-title { margin: 0 0 14px; font-size: 15px; font-weight: 800; color: #0f172a; }
.fr-f { display: block; margin-bottom: 10px; }
.fr-f-row { display: flex; gap: 8px; }
.fr-f-half { flex: 1; min-width: 0; }
.fr-f-label {
  display: block; margin-bottom: 4px;
  font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8;
}
.fr-f-input {
  width: 100%; box-sizing: border-box;
  padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 12px;
  font: inherit; font-size: 13px; color: #0f172a; background: #fff; outline: none;
}
.fr-f-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
.fr-f-import { margin: 16px 0 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc; }
.fr-f-note { margin: 0 0 10px; font-size: 12px; line-height: 1.5; color: #64748b; }
.fr-f-import .fr-btn { width: 100%; }
.fr-actions { display: flex; gap: 8px; }
.fr-actions .fr-btn { flex: 1; }

/* Submit confirmation. Bordered and set apart: this is the one control in the
   panel that cannot be undone, so it should not look like the others. */
.fr-submit-box {
  margin-top: 14px; padding: 12px;
  border: 1px solid #e2e8f0; border-radius: 14px; background: #f8fafc;
}
.fr-submit-box .fr-btn { width: 100%; }
.fr-submit-box .fr-doc-actions .fr-btn { width: auto; }
.fr-submit-confirm { border-color: #c7d2fe; background: #eef2ff; }
.fr-submit-done { border-color: #bbf7d0; background: #f0fdf4; }

/* Open questions the form asks, and the drafts offered for them. */
.fr-q { margin-bottom: 12px; }
.fr-q-ask { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #334155; line-height: 1.45; }
.fr-q-draft { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; background: #fff; }
.fr-q-thin { border-color: #fed7aa; background: #fffbeb; }
.fr-q-warn { margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #b45309; line-height: 1.45; }
.fr-q-text { margin: 0; font-size: 12px; line-height: 1.6; color: #475569; white-space: pre-wrap; }
.fr-q-actions { display: flex; gap: 6px; margin-top: 8px; }
.fr-q-actions .fr-btn { flex: 1; padding: 6px 10px; font-size: 11px; }

/* Tier system. Colour and a glyph carry which kind of field a group holds, so
   the copy does not have to repeat it in every section. */
.fr-head-row {
  display: flex; align-items: center; gap: 7px;
  margin: 0 0 10px;
  font-size: 10px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase;
}
.fr-head-label { flex: 1; min-width: 0; }
.fr-ico { width: 15px; height: 15px; display: inline-flex; flex: 0 0 auto; }
.fr-ico svg { width: 100%; height: 100%; }
.fr-count {
  flex: 0 0 auto; min-width: 18px; padding: 1px 6px; border-radius: 999px;
  font-size: 10px; font-weight: 800; text-align: center;
  background: currentColor; color: #fff;
}
.fr-count::selection { background: none; }

.fr-t-auto { color: #0f766e; }
.fr-t-auto .fr-count { background: #0f766e; }
.fr-t-you { color: #be123c; }
.fr-t-you .fr-count { background: #be123c; }
.fr-t-ask { color: #4f46e5; }
.fr-t-ask .fr-count { background: #4f46e5; }
.fr-t-send { color: #0f172a; }
.fr-t-done { color: #15803d; }

/* A tinted left edge, so scrolling past tells you which tier you are in
   without reading a word. */
.fr-g-auto { border-left: 3px solid #99f6e4; padding-left: 11px; }
.fr-g-you  { border-left: 3px solid #fecdd3; padding-left: 11px; }

.fr-q-warn { display: flex; gap: 6px; align-items: flex-start; }
.fr-q-warn .fr-ico { width: 13px; height: 13px; margin-top: 1px; color: #b45309; }
.fr-btn .fr-ico { width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; }
.fr-fill-why { font-size: 11px; line-height: 1.5; }

.fr-q-edit {
  width: 100%; box-sizing: border-box; resize: vertical;
  padding: 9px 10px; border: 1px solid #e2e8f0; border-radius: 10px;
  font: inherit; font-size: 12px; line-height: 1.6; color: #334155; background: #fff; outline: none;
}
.fr-q-edit:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
.fr-q-mine { margin: 0 0 6px; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #0f766e; }
`;
