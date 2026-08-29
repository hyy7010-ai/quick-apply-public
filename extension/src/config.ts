/**
 * Where the extension talks to. Injected at build time by scripts/build-extension.mjs
 * from the same .env the web app uses, so the two never point at different
 * projects by accident.
 */
declare const __API_ORIGIN__: string;
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

export const API_ORIGIN = __API_ORIGIN__;
export const SUPABASE_URL = __SUPABASE_URL__;
export const SUPABASE_ANON_KEY = __SUPABASE_ANON_KEY__;

/** localStorage key supabase-js uses on the web app, derived from the project ref. */
export const SESSION_STORAGE_KEY = `sb-${SUPABASE_URL.replace('https://', '').split('.')[0]}-auth-token`;

/** chrome.storage key where the harvested session lives. */
export const STORED_SESSION = 'fastresume_session';
