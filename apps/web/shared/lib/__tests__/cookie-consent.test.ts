import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'test-csrf-token',
  })),
}));

import { findConsentPurpose, isConsentSurface } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  ALL_ACCEPTED_PREFERENCES,
  ANALYTICS_CONSENT_PURPOSE,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_NOTICE_VERSION,
  CONSENT_LEDGER_NOTICE_VERSION,
  NECESSARY_ONLY_PREFERENCES,
  adoptAccountCookieConsent,
  applyAnalyticsConsentLocally,
  buildCookieConsentRecord,
  isAnalyticsAllowed,
  isAnalyticsLockedByOptOutSignal,
  parseCookieConsentRecord,
  readAccountCookieConsent,
  readCookieConsentRecord,
  readCookiePreferences,
  writeCookiePreferences,
} from '../cookie-consent';

function storedRecord(): Record<string, unknown> {
  return JSON.parse(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) ?? 'null') as Record<
    string,
    unknown
  >;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ recorded: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('cookie consent proof of consent', () => {
  it('stamps the stored decision with a timestamp and the notice version', () => {
    const before = Date.now();
    writeCookiePreferences(ALL_ACCEPTED_PREFERENCES);

    const record = storedRecord();
    expect(record['analytics']).toBe(true);
    expect(record['noticeVersion']).toBe(COOKIE_NOTICE_VERSION);
    expect(typeof record['decidedAt']).toBe('string');
    expect(Date.parse(String(record['decidedAt']))).toBeGreaterThanOrEqual(before);
  });

  it('reads back the stamped record', () => {
    writeCookiePreferences(NECESSARY_ONLY_PREFERENCES);

    const record = readCookieConsentRecord();
    expect(record?.analytics).toBe(false);
    expect(record?.noticeVersion).toBe(COOKIE_NOTICE_VERSION);
    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: false });
  });

  it('ties the version to the cookie notice alone, so a privacy edit does not re-ask', () => {
    expect(COOKIE_NOTICE_VERSION).toBe(`cookies:${POLICY_LAST_UPDATED.cookies}`);
  });
});

describe('cookie consent expiry when the notice changes', () => {
  it('treats consent given against a superseded notice as undecided', () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({
        ...buildCookieConsentRecord(ALL_ACCEPTED_PREFERENCES),
        noticeVersion: 'cookies:1999-01-01+privacy:1999-01-01',
      }),
    );

    expect(readCookiePreferences()).toBeNull();
  });

  it('treats a version-less legacy record as undecided rather than as consent', () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({ necessary: true, analytics: true }),
    );

    expect(readCookiePreferences()).toBeNull();
  });

  it('rejects a record whose timestamp is missing or unparseable', () => {
    expect(parseCookieConsentRecord(JSON.stringify({ analytics: true, noticeVersion: 'x' }))).toBe(
      null,
    );
    expect(
      parseCookieConsentRecord(
        JSON.stringify({ analytics: true, noticeVersion: 'x', decidedAt: 'never' }),
      ),
    ).toBe(null);
  });

  it('honours a record written against the current notice', () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(buildCookieConsentRecord(ALL_ACCEPTED_PREFERENCES)),
    );

    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });
  });
});

describe('cookie consent server ledger', () => {
  it('posts the analytics decision to the consent ledger with CSRF and notice version', async () => {
    writeCookiePreferences(ALL_ACCEPTED_PREFERENCES);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/consent');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'test-csrf-token' });
    expect(JSON.parse(String(init.body))).toEqual({
      decisions: [{ purpose: ANALYTICS_CONSENT_PURPOSE, granted: true }],
      surface: 'web-cookie-banner',
      noticeVersion: CONSENT_LEDGER_NOTICE_VERSION,
    });
  });

  it('records a withdrawal as an explicit false, not as silence', async () => {
    writeCookiePreferences(NECESSARY_ONLY_PREFERENCES);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).decisions).toEqual([
      { purpose: ANALYTICS_CONSENT_PURPOSE, granted: false },
    ]);
  });

  it('keeps the local decision when the ledger write fails for a signed-out visitor', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    writeCookiePreferences(ALL_ACCEPTED_PREFERENCES);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });
  });

  it('sends a purpose and surface the ledger actually accepts', () => {
    expect(findConsentPurpose(ANALYTICS_CONSENT_PURPOSE)).toBeDefined();
    expect(isConsentSurface('web-cookie-banner')).toBe(true);
    expect(CONSENT_LEDGER_NOTICE_VERSION).toBe(POLICY_LAST_UPDATED.privacy);
  });
});

describe('a browser that sends the opt-out signal', () => {
  function optOut(value: unknown): void {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'globalPrivacyControl');
  });

  it('reads as analytics off even when an acceptance is stored', () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(buildCookieConsentRecord(ALL_ACCEPTED_PREFERENCES)),
    );
    optOut(true);

    expect(readCookiePreferences()).toEqual(NECESSARY_ONLY_PREFERENCES);
    expect(isAnalyticsAllowed(readCookiePreferences())).toBe(false);
  });

  it('keeps the necessary category, so the signal never costs a session', () => {
    optOut(true);
    expect(readCookiePreferences()?.necessary).toBe(true);
  });

  it('cannot be talked out of it by a later acceptance', async () => {
    optOut(true);
    writeCookiePreferences(ALL_ACCEPTED_PREFERENCES);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(storedRecord()['analytics']).toBe(false);
    expect(readCookiePreferences()).toEqual(NECESSARY_ONLY_PREFERENCES);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).decisions).toEqual([
      { purpose: ANALYTICS_CONSENT_PURPOSE, granted: false },
    ]);
  });

  it('does not force the account-side record off when the browser is silent', () => {
    optOut(false);
    applyAnalyticsConsentLocally(true);
    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });
  });

  it('holds the account-side record to off while the signal is on', () => {
    optOut(true);
    applyAnalyticsConsentLocally(true);
    expect(readCookiePreferences()).toEqual(NECESSARY_ONLY_PREFERENCES);
  });

  it('is reported to the interface so the switch can explain itself', () => {
    optOut(true);
    expect(isAnalyticsLockedByOptOutSignal()).toBe(true);
    optOut(false);
    expect(isAnalyticsLockedByOptOutSignal()).toBe(false);
  });
});

describe('a signed-in account that already answered elsewhere', () => {
  const afterNotice = `${POLICY_LAST_UPDATED.cookies}T12:00:00.000Z`;

  function signIn(signedIn: boolean): void {
    document.cookie = signedIn
      ? '__client_uat=1700000000; path=/'
      : '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  }

  function ledgerAnswers(consents: unknown[]): void {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ consents }), { status: 200 }),
    );
  }

  afterEach(() => signIn(false));

  it('asks the ledger only when a session exists', async () => {
    signIn(false);
    expect(await readAccountCookieConsent()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('carries a decision made under the current cookie notice to this browser', async () => {
    signIn(true);
    ledgerAnswers([{ purpose: ANALYTICS_CONSENT_PURPOSE, granted: true, recordedAt: afterNotice }]);

    const record = await readAccountCookieConsent();
    expect(record).not.toBeNull();
    adoptAccountCookieConsent(record!);

    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });
    expect(readCookieConsentRecord()?.decidedAt).toBe(afterNotice);
  });

  it('asks again when the account decision predates the current cookie notice', async () => {
    signIn(true);
    ledgerAnswers([
      { purpose: ANALYTICS_CONSENT_PURPOSE, granted: true, recordedAt: '1999-01-01T00:00:00.000Z' },
    ]);

    expect(await readAccountCookieConsent()).toBeNull();
  });

  it('treats a failed or empty ledger read as undecided', async () => {
    signIn(true);
    ledgerAnswers([]);
    expect(await readAccountCookieConsent()).toBeNull();

    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }));
    expect(await readAccountCookieConsent()).toBeNull();
  });
});
