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
  buildCookieConsentRecord,
  parseCookieConsentRecord,
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

  it('ties the version to both notices the banner answers for', () => {
    expect(COOKIE_NOTICE_VERSION).toContain(POLICY_LAST_UPDATED.cookies);
    expect(COOKIE_NOTICE_VERSION).toContain(POLICY_LAST_UPDATED.privacy);
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
