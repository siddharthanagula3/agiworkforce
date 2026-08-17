import { addCsrfHeaders } from '@/lib/client/csrf';
import type { ConsentSurface } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const ANALYTICS_REQUIRES_CONSENT: boolean = true;

export const COOKIE_CONSENT_STORAGE_KEY = 'cookie-consent';

export const COOKIE_CONSENT_UPDATED_EVENT = 'cookie-consent-updated';

export const COOKIE_CONSENT_OPEN_EVENT = 'cookie-consent-open';

// The banner answers for both notices, so either one moving must re-ask. The
// server ledger stamps the privacy revision alone and rejects anything else,
// which is why the posted version is not this composite.
export const COOKIE_NOTICE_VERSION = `cookies:${POLICY_LAST_UPDATED.cookies}+privacy:${POLICY_LAST_UPDATED.privacy}`;

export const CONSENT_LEDGER_NOTICE_VERSION: string = POLICY_LAST_UPDATED.privacy;

export const ANALYTICS_CONSENT_PURPOSE = 'product_analytics';

const COOKIE_BANNER_SURFACE: ConsentSurface = 'web-cookie-banner';

export interface CookiePreferences {
  necessary: true;
  analytics: boolean;
}

export interface CookieConsentRecord extends CookiePreferences {
  noticeVersion: string;
  decidedAt: string;
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

export function parseCookieConsentRecord(raw: string | null): CookieConsentRecord | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { analytics, noticeVersion, decidedAt } = parsed as Record<string, unknown>;
  if (typeof analytics !== 'boolean') return null;
  if (typeof noticeVersion !== 'string' || typeof decidedAt !== 'string') return null;
  if (Number.isNaN(Date.parse(decidedAt))) return null;
  return { necessary: true, analytics, noticeVersion, decidedAt };
}

export function isCookieConsentCurrent(record: CookieConsentRecord | null): boolean {
  return record?.noticeVersion === COOKIE_NOTICE_VERSION;
}

export function readCookieConsentRecord(): CookieConsentRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseCookieConsentRecord(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

// A record that carries no version, or a version from a superseded notice,
// cannot prove what was agreed to, so it reads as undecided: analytics stops
// and the banner asks again.
export function readCookiePreferences(): CookiePreferences | null {
  const record = readCookieConsentRecord();
  if (!record || !isCookieConsentCurrent(record)) return null;
  return { necessary: true, analytics: record.analytics };
}

export function buildCookieConsentRecord(
  preferences: CookiePreferences,
  decidedAt: Date = new Date(),
): CookieConsentRecord {
  return {
    necessary: true,
    analytics: preferences.analytics,
    noticeVersion: COOKIE_NOTICE_VERSION,
    decidedAt: decidedAt.toISOString(),
  };
}

export async function recordCookieConsentOnServer(record: CookieConsentRecord): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/consent', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({
        decisions: [{ purpose: ANALYTICS_CONSENT_PURPOSE, granted: record.analytics }],
        surface: COOKIE_BANNER_SURFACE,
        noticeVersion: CONSENT_LEDGER_NOTICE_VERSION,
      }),
    });
    return response.ok;
  } catch {
    // A signed-out visitor has no ledger row to write and the request can also
    // fail offline. The stored record still governs this browser either way.
    return false;
  }
}

export function writeCookiePreferences(preferences: CookiePreferences): void {
  if (typeof window === 'undefined') return;
  const record = buildCookieConsentRecord(preferences);
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage refused the write (private mode, quota). The in-memory state
    // still applies for this page, and the banner returns next visit rather
    // than pretending a choice was recorded.
  }
  void recordCookieConsentOnServer(record);
  window.dispatchEvent(
    new CustomEvent<CookiePreferences>(COOKIE_CONSENT_UPDATED_EVENT, { detail: preferences }),
  );
}

export function isAnalyticsAllowed(preferences: CookiePreferences | null): boolean {
  if (!ANALYTICS_REQUIRES_CONSENT) return true;
  return preferences?.analytics === true;
}
