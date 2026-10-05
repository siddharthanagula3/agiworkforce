import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  standing: vi.fn(),
  record: vi.fn(),
  csrf: vi.fn(),
  consent: vi.fn(),
  latestConsent: vi.fn(),
  track: vi.fn(),
  referral: vi.fn(),
}));

vi.mock('@/lib/error-handler', async (importOriginal) => ({
  ...(await importOriginal()),
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal()),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'person-a' })),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: { error: vi.fn() },
}));
vi.mock('@/lib/server/product-analytics', async (importOriginal) => ({
  ...(await importOriginal()),
  trackProductAnalyticsEvent: (...args: unknown[]) => mocks.track(...args),
}));
vi.mock('@/lib/server/consent-records', async (importOriginal) => ({
  ...(await importOriginal()),
  recordConsent: (...args: unknown[]) => mocks.consent(...args),
  readLatestConsent: (...args: unknown[]) => mocks.latestConsent(...args),
}));
vi.mock('@/lib/services/referral-attribution', async (importOriginal) => ({
  ...(await importOriginal()),
  attributeReferralFromRequest: (...args: unknown[]) => mocks.referral(...args),
}));
vi.mock('@/lib/server/terms', async (importOriginal) => ({
  ...(await importOriginal()),
  CURRENT_TERMS_VERSION: 'current-policy',
  readTermsStanding: (...args: unknown[]) => mocks.standing(...args),
  recordTermsAcceptance: (...args: unknown[]) => mocks.record(...args),
}));

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { GLOBAL_PRIVACY_CONTROL_HEADER } from '@/lib/consent-signals';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { GET, POST } from './route';

const NOTICE_ON_SCREEN = POLICY_LAST_UPDATED.privacy;

function accept(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('https://agiworkforce.com/api/terms/accept', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function firstCallOrder(mock: { mock: { invocationCallOrder: number[] } }): number {
  return mock.mock.invocationCallOrder[0] ?? Number.NaN;
}

describe('native Terms acceptance API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
  });

  it('reports the current version and account-specific acceptance without caching', async () => {
    mocks.standing.mockResolvedValue({ kind: 'required', reason: 'never_accepted' });
    const response = await GET(new NextRequest('https://agiworkforce.com/api/terms/accept'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ currentVersion: 'current-policy', accepted: false });
    expect(mocks.standing).toHaveBeenCalledWith('person-a');
  });

  it('treats an older version that is still valid as accepted, as the chat gate does', async () => {
    mocks.standing.mockResolvedValue({
      kind: 'notice',
      acceptedVersion: 'older',
      requiredFrom: null,
    });
    const response = await GET(new NextRequest('https://agiworkforce.com/api/terms/accept'));

    expect(await response.json()).toEqual({ currentVersion: 'current-policy', accepted: true });
  });

  it('records an explicit native acceptance at the current version', async () => {
    mocks.record.mockResolvedValue({
      version: 'current-policy',
      acceptedAt: '2026-09-26T00:00:00Z',
    });
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/terms/accept', {
        method: 'POST',
        body: JSON.stringify({ surface: 'mobile-auth', version: 'current-policy' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith('person-a', 'mobile-auth');
  });

  it('rejects a stale version before writing acceptance', async () => {
    const response = await POST(
      new NextRequest('https://agiworkforce.com/api/terms/accept', {
        method: 'POST',
        body: JSON.stringify({ surface: 'mobile-auth', version: 'old-policy' }),
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});

describe('marketing email asked with the terms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.record.mockResolvedValue({
      version: 'current-policy',
      acceptedAt: '2026-10-04T00:00:00Z',
    });
    mocks.consent.mockResolvedValue({
      purpose: MARKETING_EMAIL_CONSENT_PURPOSE.id,
      granted: true,
      noticeVersion: NOTICE_ON_SCREEN,
      surface: 'web-signup',
      recordedAt: '2026-10-04T00:00:00Z',
    });
    mocks.referral.mockResolvedValue(undefined);
    mocks.latestConsent.mockResolvedValue(null);
  });

  it.each(['web-signup', 'web-login'] as const)(
    'writes one grant against %s, after the acceptance and before attribution',
    async (surface) => {
      const response = await accept({
        surface,
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      });

      expect(response.status).toBe(200);
      expect(mocks.record).toHaveBeenCalledWith('person-a', surface);
      expect(mocks.consent).toHaveBeenCalledTimes(1);
      expect(mocks.consent).toHaveBeenCalledWith({
        subject: { kind: 'user', userId: 'person-a' },
        purpose: MARKETING_EMAIL_CONSENT_PURPOSE.id,
        granted: true,
        surface,
      });
      expect(firstCallOrder(mocks.record)).toBeLessThan(firstCallOrder(mocks.consent));
      expect(firstCallOrder(mocks.consent)).toBeLessThan(firstCallOrder(mocks.referral));
    },
  );

  it('writes the grant as marketing_email and never as the waitlist product updates purpose', async () => {
    await accept({
      surface: 'web-signup',
      version: 'current-policy',
      marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
    });

    expect(
      mocks.consent.mock.calls.map(([input]) => (input as { purpose: string }).purpose),
    ).toEqual(['marketing_email']);
    expect(mocks.latestConsent.mock.calls).toEqual([['person-a', 'marketing_email']]);
  });

  it.each([
    ['granted', true],
    ['refused', false],
  ])(
    'still writes the grant for an account that only %s waitlist product updates',
    async (_case, granted) => {
      mocks.latestConsent.mockImplementation(async (_userId: string, purpose: string) =>
        purpose === 'product_updates'
          ? {
              purpose: 'product_updates',
              granted,
              noticeVersion: NOTICE_ON_SCREEN,
              surface: 'web-waitlist-inline',
              recordedAt: '2026-10-01T00:00:00Z',
            }
          : null,
      );

      const response = await accept({
        surface: 'web-signup',
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      });

      expect(response.status).toBe(200);
      expect(mocks.consent).toHaveBeenCalledTimes(1);
      expect(mocks.consent).toHaveBeenCalledWith({
        subject: { kind: 'user', userId: 'person-a' },
        purpose: 'marketing_email',
        granted: true,
        surface: 'web-signup',
      });
    },
  );

  it('does not read the field the box was first built with as an opt-in', async () => {
    const response = await accept({
      surface: 'web-signup',
      version: 'current-policy',
      productUpdatesNoticeVersion: NOTICE_ON_SCREEN,
    });

    expect(response.status).toBe(200);
    expect(mocks.latestConsent).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it('writes the grant before the sign-up event is counted', async () => {
    await accept({
      surface: 'web-signup',
      version: 'current-policy',
      marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
    });

    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(firstCallOrder(mocks.consent)).toBeLessThan(firstCallOrder(mocks.track));
  });

  it.each(['web-signup', 'web-login', 'mobile-auth'] as const)(
    'records no decision for %s when the box was left unticked',
    async (surface) => {
      const response = await accept({ surface, version: 'current-policy' });

      expect(response.status).toBe(200);
      expect(mocks.record).toHaveBeenCalledWith('person-a', surface);
      expect(mocks.consent).not.toHaveBeenCalled();
    },
  );

  it('refuses the choice from a surface that never asks it, writing nothing', async () => {
    await expect(
      accept({
        surface: 'mobile-auth',
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });

    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it('answers 409 and writes nothing when the notice changed after the box was ticked', async () => {
    const response = await accept({
      surface: 'web-signup',
      version: 'current-policy',
      marketingEmailNoticeVersion: '1970-01-01',
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'NOTICE_VERSION_OUTDATED',
        message: 'The privacy notice changed after this page loaded.',
      },
      currentNoticeVersion: NOTICE_ON_SCREEN,
    });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.referral).not.toHaveBeenCalled();
  });

  it('writes nothing when the terms are stale even though the notice is current', async () => {
    const response = await accept({
      surface: 'web-login',
      version: 'old-policy',
      marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'TERMS_VERSION_OUTDATED' } });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it('records the grant as a refusal when the browser sends Global Privacy Control', async () => {
    const response = await accept(
      {
        surface: 'web-signup',
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      },
      { [GLOBAL_PRIVACY_CONTROL_HEADER]: '1' },
    );

    expect(response.status).toBe(200);
    expect(mocks.consent).toHaveBeenCalledTimes(1);
    expect(mocks.consent).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: MARKETING_EMAIL_CONSENT_PURPOSE.id,
        granted: false,
        surface: 'web-signup',
      }),
    );
  });

  it('records nothing about marketing email under the signal when the box was not ticked', async () => {
    await accept(
      { surface: 'web-signup', version: 'current-policy' },
      { [GLOBAL_PRIVACY_CONTROL_HEADER]: '1' },
    );

    expect(mocks.consent).not.toHaveBeenCalled();
  });

  it.each([
    ['granted', true, 'web-signup'],
    ['withdrew', false, 'web-settings'],
    ['refused', false, 'web-consent-centre'],
  ] as const)(
    'appends nothing when the account already %s, so a repeated request cannot override it',
    async (_case, granted, surface) => {
      mocks.latestConsent.mockResolvedValue({
        purpose: MARKETING_EMAIL_CONSENT_PURPOSE.id,
        granted,
        noticeVersion: NOTICE_ON_SCREEN,
        surface,
        recordedAt: '2026-10-04T00:05:00Z',
      });

      const response = await accept({
        surface: 'web-signup',
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      });

      expect(response.status).toBe(200);
      expect(mocks.latestConsent).toHaveBeenCalledWith(
        'person-a',
        MARKETING_EMAIL_CONSENT_PURPOSE.id,
      );
      expect(mocks.record).toHaveBeenCalledWith('person-a', 'web-signup');
      expect(mocks.consent).not.toHaveBeenCalled();
    },
  );

  it('writes the grant once however often the same request is repeated', async () => {
    const ledger: { granted: boolean; surface: string }[] = [];
    mocks.latestConsent.mockImplementation(async () => ledger.at(-1) ?? null);
    mocks.consent.mockImplementation(async (input: { granted: boolean; surface: string }) => {
      ledger.push({ granted: input.granted, surface: input.surface });
      return ledger.at(-1);
    });
    const request = {
      surface: 'web-signup',
      version: 'current-policy',
      marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
    };

    await accept(request);
    ledger.push({ granted: false, surface: 'web-settings' });
    const repeated = await accept(request);
    await accept(request);

    expect(repeated.status).toBe(200);
    expect(ledger).toEqual([
      { granted: true, surface: 'web-signup' },
      { granted: false, surface: 'web-settings' },
    ]);
  });

  it('does not read the ledger when the box was left unticked', async () => {
    await accept({ surface: 'web-login', version: 'current-policy' });

    expect(mocks.latestConsent).not.toHaveBeenCalled();
  });

  it('fails the whole request and writes nothing when the ledger cannot be read', async () => {
    mocks.latestConsent.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      accept({
        surface: 'web-signup',
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR', statusCode: 500 });

    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.consent).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.referral).not.toHaveBeenCalled();
  });

  it('fails the whole request when the grant cannot be written', async () => {
    mocks.consent.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      accept({
        surface: 'web-signup',
        version: 'current-policy',
        marketingEmailNoticeVersion: NOTICE_ON_SCREEN,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR', statusCode: 500 });

    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.referral).not.toHaveBeenCalled();
  });
});
