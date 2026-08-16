
export const ANALYTICS_REQUIRES_CONSENT: boolean = true;

export const COOKIE_CONSENT_STORAGE_KEY = 'cookie-consent';

export const COOKIE_CONSENT_UPDATED_EVENT = 'cookie-consent-updated';

export const COOKIE_CONSENT_OPEN_EVENT = 'cookie-consent-open';

export interface CookiePreferences {
  necessary: true;
  analytics: boolean;
}

export const NECESSARY_ONLY_PREFERENCES: CookiePreferences = {
  necessary: true,
  analytics: false,
};

export const ALL_ACCEPTED_PREFERENCES: CookiePreferences = {
  necessary: true,
  analytics: true,
};

export function parseCookiePreferences(raw: string | null): CookiePreferences | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const analytics = (parsed as Record<string, unknown>)['analytics'];
    if (typeof analytics !== 'boolean') return null;
    return { necessary: true, analytics };
  } catch {
    return null;
  }
}

export function readCookiePreferences(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseCookiePreferences(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeCookiePreferences(preferences: CookiePreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage refused the write (private mode, quota). The in-memory state
    // still applies for this page, and the banner returns next visit rather
    // than pretending a choice was recorded.
  }
  window.dispatchEvent(
    new CustomEvent<CookiePreferences>(COOKIE_CONSENT_UPDATED_EVENT, { detail: preferences }),
  );
}

export function isAnalyticsAllowed(preferences: CookiePreferences | null): boolean {
  if (!ANALYTICS_REQUIRES_CONSENT) return true;
  return preferences?.analytics === true;
}
