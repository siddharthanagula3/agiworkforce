/**
 * Cookie-consent contract (SIX-25).
 *
 * ONE seam decides whether analytics may load. `CookieConsent` writes the
 * user's choice here; `AnalyticsConsentGate` reads it and is the only thing
 * that may mount `GoogleAnalytics`. Nothing else should touch localStorage for
 * this key or listen for the event by hand.
 *
 * DEFAULT: opt-in. This is not a guess — `/cookies` publishes "Analytics is
 * opt-in" and "Advertising: None. We do not run ads.", so loading gtag.js
 * before consent contradicted the site's own policy page.
 *
 * FOUNDER SWITCH: to take the analytics-always position, flip
 * `ANALYTICS_REQUIRES_CONSENT` to `false` and update `/cookies` in the same
 * change so the policy and the code keep saying the same thing. That single
 * constant is the entire gate — no other file needs editing.
 */

/**
 * Flip to `false` only together with the `/cookies` policy copy. Annotated as
 * `boolean` rather than the literal `true` so flipping it does not turn every
 * consumer's branch into dead code the compiler complains about.
 */
export const ANALYTICS_REQUIRES_CONSENT: boolean = true;

export const COOKIE_CONSENT_STORAGE_KEY = 'cookie-consent';

/** Fired after the user saves a choice. Detail is `CookiePreferences`. */
export const COOKIE_CONSENT_UPDATED_EVENT = 'cookie-consent-updated';

/** Fired to re-open the preferences dialog (e.g. from the /cookies page). */
export const COOKIE_CONSENT_OPEN_EVENT = 'cookie-consent-open';

export interface CookiePreferences {
  /** Auth session, CSRF token, locale. Always on; cannot be switched off. */
  necessary: true;
  /** Aggregated GA4 page views. Off until the user says otherwise. */
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

/**
 * Parses whatever is in storage. Anything unreadable, malformed, or written by
 * an older shape counts as "no decision yet" — never as consent.
 */
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

/** `null` when the user has not decided yet (so the banner must be shown). */
export function readCookiePreferences(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseCookiePreferences(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    // Private-mode / blocked storage: treat as undecided, which means no
    // analytics. Failing closed is the only safe read here.
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

/**
 * The only question `AnalyticsConsentGate` asks. Undecided → false.
 */
export function isAnalyticsAllowed(preferences: CookiePreferences | null): boolean {
  if (!ANALYTICS_REQUIRES_CONSENT) return true;
  return preferences?.analytics === true;
}
