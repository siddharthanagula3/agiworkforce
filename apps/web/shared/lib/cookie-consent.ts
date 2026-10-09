import { addCsrfHeaders } from '@/lib/client/csrf';
import { hasClerkSessionCookie } from '@/lib/clerk-session';
import type { ConsentSurface } from '@/lib/consent-purposes';
import { readBrowserGlobalPrivacyControl } from '@/lib/consent-signals';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const ANALYTICS_REQUIRES_CONSENT: boolean = true;

export const COOKIE_CONSENT_STORAGE_KEY = 'cookie-consent';

export const COOKIE_CONSENT_UPDATED_EVENT = 'cookie-consent-updated';

export const COOKIE_CONSENT_OPEN_EVENT = 'cookie-consent-open';

export const COOKIE_PREFERENCES_LABEL = 'Cookie preferences';

// Only a change to the cookie notice re-asks; a privacy-policy edit does not
// change what the banner asks about. The server ledger stamps the privacy
// revision alone and rejects anything else, which is why the posted version
// differs from this one.
export const COOKIE_NOTICE_VERSION = `cookies:${POLICY_LAST_UPDATED.cookies}`;

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

// A browser sending Global Privacy Control has already refused everything that
// is not needed to serve the request, so that answer stands for this browser
// whatever is stored here, and the banner has nothing left to ask.
export function isAnalyticsLockedByOptOutSignal(): boolean {
  return readBrowserGlobalPrivacyControl();
}

function resolvePreferences(preferences: CookiePreferences): CookiePreferences {
  return isAnalyticsLockedByOptOutSignal() ? NECESSARY_ONLY_PREFERENCES : preferences;
}

// A record that carries no version, or a version from a superseded notice,
// cannot prove what was agreed to, so it reads as undecided: analytics stops
// and the banner asks again.
export function readCookiePreferences(): CookiePreferences | null {
  if (isAnalyticsLockedByOptOutSignal()) return NECESSARY_ONLY_PREFERENCES;
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

function storeCookieConsentRecord(record: CookieConsentRecord): void {
  if (typeof window === 'undefined') return;
  const preferences: CookiePreferences = { necessary: true, analytics: record.analytics };
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage refused the write (private mode, quota). The in-memory state
    // still applies for this page, and the banner returns next visit rather
    // than pretending a choice was recorded.
  }
  window.dispatchEvent(
    new CustomEvent<CookiePreferences>(COOKIE_CONSENT_UPDATED_EVENT, { detail: preferences }),
  );
}

export function writeCookiePreferences(preferences: CookiePreferences): void {
  if (typeof window === 'undefined') return;
  const record = buildCookieConsentRecord(resolvePreferences(preferences));
  storeCookieConsentRecord(record);
  void recordCookieConsentOnServer(record);
}

// The consent centre writes its own ledger row through /api/consent, so this
// applies the same decision to the browser the gate reads without posting it
// twice.
export function applyAnalyticsConsentLocally(granted: boolean): void {
  if (typeof window === 'undefined') return;
  const effective = resolvePreferences({ necessary: true, analytics: granted });
  if (readCookiePreferences()?.analytics === effective.analytics) return;
  storeCookieConsentRecord(buildCookieConsentRecord(effective));
}

const COOKIE_NOTICE_EFFECTIVE_AT = Date.parse(`${POLICY_LAST_UPDATED.cookies}T00:00:00Z`);

export function accountDecisionCoversCookieNotice(recordedAt: string): boolean {
  const decidedAt = Date.parse(recordedAt);
  return Number.isFinite(decidedAt) && decidedAt >= COOKIE_NOTICE_EFFECTIVE_AT;
}

// A signed-in visitor who already answered on another browser or device has
// that answer in the account ledger. It stands here too when it was given
// under the current cookie notice, so the banner does not ask again.
export async function readAccountCookieConsent(): Promise<CookieConsentRecord | null> {
  if (typeof window === 'undefined' || !hasClerkSessionCookie()) return null;
  try {
    const response = await fetch('/api/consent', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { consents?: unknown };
    if (!Array.isArray(body.consents)) return null;
    const decision = (body.consents as Array<Record<string, unknown>>).find(
      (row) => row['purpose'] === ANALYTICS_CONSENT_PURPOSE,
    );
    const granted = decision?.['granted'];
    const recordedAt = decision?.['recordedAt'];
    if (typeof granted !== 'boolean' || typeof recordedAt !== 'string') return null;
    if (!accountDecisionCoversCookieNotice(recordedAt)) return null;
    return buildCookieConsentRecord(
      resolvePreferences({ necessary: true, analytics: granted }),
      new Date(recordedAt),
    );
  } catch {
    return null;
  }
}

export function adoptAccountCookieConsent(record: CookieConsentRecord): void {
  if (typeof window === 'undefined') return;
  storeCookieConsentRecord(record);
}

export function isAnalyticsAllowed(preferences: CookiePreferences | null): boolean {
  if (!ANALYTICS_REQUIRES_CONSENT) return true;
  return preferences?.analytics === true;
}
