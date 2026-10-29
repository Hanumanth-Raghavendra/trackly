import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** True inside the Android/iOS app shell, false in a browser (including the installed PWA). */
export const isNative = Capacitor.isNativePlatform();

const env = import.meta.env;
const trim = (v: string | undefined) => (v ?? '').replace(/\/+$/, '');

/** Empty string = same origin (web). The native app needs absolute URLs from .env.mobile. */
export const API_URL = trim(env.VITE_API_URL);
export const INSIGHTS_URL = trim(env.VITE_INSIGHTS_URL) || API_URL;
export const SOCKET_URL = trim(env.VITE_SOCKET_URL) || INSIGHTS_URL || undefined;
export const GITHUB_URL = env.VITE_GITHUB_URL || 'https://github.com/Hanumanth-Raghavendra/trackly';

/**
 * Refresh-token storage for native clients only. Browsers never see the refresh token —
 * it lives in an httpOnly cookie. On Android it's kept in the app's private storage.
 */
const REFRESH_KEY = 'trackly.refreshToken';

export const nativeTokenStore = {
  async get(): Promise<string | null> {
    if (!isNative) return null;
    return (await Preferences.get({ key: REFRESH_KEY })).value;
  },
  async set(token: string | null | undefined) {
    if (!isNative) return;
    if (token) await Preferences.set({ key: REFRESH_KEY, value: token });
    else await Preferences.remove({ key: REFRESH_KEY });
  },
};

/**
 * A non-secret "this browser has signed in before" flag. Without it the web app skips the
 * refresh call on first load, so a landing-page visit doesn't wake the (free, sleeping) API.
 * The credential itself stays in an httpOnly cookie.
 */
const HINT_KEY = 'trackly.session';
export const sessionHint = {
  get(): boolean {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return true; // storage blocked: fall back to always trying the cookie
    }
  },
  set(on: boolean) {
    try {
      if (on) localStorage.setItem(HINT_KEY, '1');
      else localStorage.removeItem(HINT_KEY);
    } catch {
      // Private mode or blocked storage: the cookie still works.
    }
  },
};

/** Legacy names some browsers still report (Chrome on Indian systems says "Asia/Calcutta"). */
const ZONE_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
};

export function browserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return ZONE_ALIASES[tz] ?? tz;
  } catch {
    return 'UTC';
  }
}
