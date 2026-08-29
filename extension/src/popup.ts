import { API_ORIGIN, STORED_SESSION } from './config';

/** Tells the user whether the extension has picked up their web-app session,
 * which is the single most common reason the panel appears to "do nothing". */
async function init(): Promise<void> {
  const link = document.getElementById('open') as HTMLAnchorElement;
  link.href = API_ORIGIN;

  const el = document.getElementById('status')!;
  const stored = (await chrome.storage.local.get(STORED_SESSION)) as Record<
    string,
    { user?: { id?: string; email?: string } } | undefined
  >;
  const session = stored[STORED_SESSION];

  if (session?.user?.id) {
    el.className = 'status in';
    el.textContent = `Signed in${session.user.email ? ` as ${session.user.email}` : ''}`;
  } else {
    el.className = 'status out';
    el.textContent = 'Not signed in — open FastResume and sign in once.';
  }
}

void init();
