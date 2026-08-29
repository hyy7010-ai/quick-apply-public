import { SESSION_STORAGE_KEY } from './config';

/**
 * Runs only on the FastResume web app's own pages.
 *
 * Rather than building a second login inside the extension, this picks up the
 * session the user already has. A content script shares the page's origin, so
 * it can read the token supabase-js stored there — which means one account,
 * one login, and no OAuth redirect flow to maintain inside an extension whose
 * ID changes between unpacked loads.
 *
 * Only the access token and user id/email are forwarded. The refresh token is
 * left behind on purpose: the extension cannot mint new sessions, so if the
 * token expires the user simply visits the web app again.
 */
function readSession(): { access_token: string; user: { id: string; email?: string } } | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.access_token;
    const user = parsed?.user;
    if (!token || !user?.id) return null;
    return { access_token: token, user: { id: user.id, email: user.email } };
  } catch {
    return null;
  }
}

/**
 * The language the user picked in the app, not the one the browser happens to
 * be set to. Someone running an English Chrome who chose Chinese in FastResume
 * expects the panel in Chinese; guessing from navigator.language got that
 * wrong for exactly those people.
 */
function readLang(): string | null {
  try {
    return localStorage.getItem('lang');
  } catch {
    return null;
  }
}

function sync(): void {
  chrome.runtime
    .sendMessage({ type: 'SESSION_SYNC', session: readSession(), lang: readLang() })
    .catch(() => undefined);
}

sync();

// Catch sign-in/sign-out that happens after load, and the moment an OAuth
// redirect lands back on the page.
window.addEventListener('storage', (e) => {
  if (e.key === SESSION_STORAGE_KEY || e.key === 'lang') sync();
});
setTimeout(sync, 2500);
