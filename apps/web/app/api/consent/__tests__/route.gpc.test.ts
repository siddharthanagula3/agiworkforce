import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_PURPOSES, CONSENT_SURFACES } from '@/lib/consent-purposes';
type ScanModule0 = typeof import('@/lib/csrf');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/api-auth');
type ScanModule3 = typeof import('@/lib/server/consent-records');

const mocks = vi.hoisted(() => ({
  recordConsentBatch: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));
vi.mock('@/lib/server/consent-records', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  recordConsentBatch: mocks.recordConsentBatch,
}));

const { POST } = await import('../route');
const { CURRENT_NOTICE_VERSION } = await import('@/lib/server/consent-records');

const NON_ESSENTIAL = CONSENT_PURPOSES.find((purpose) => !purpose.necessaryForRequest)!.id;
const ESSENTIAL = CONSENT_PURPOSES.find((purpose) => purpose.necessaryForRequest)!.id;

function post(headers: Record<string, string>) {
  return new Request('http://localhost:3000/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      decisions: [
        { purpose: NON_ESSENTIAL, granted: true },
        { purpose: ESSENTIAL, granted: true },
      ],
      surface: CONSENT_SURFACES[0],
      noticeVersion: CURRENT_NOTICE_VERSION,
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/consent under Global Privacy Control', () => {
  // The suite resets mocks between cases, so every implementation is set here.
  beforeEach(() => {
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.recordConsentBatch.mockReset().mockResolvedValue(2);
  });

  it('records a grant for a non essential purpose as the refusal the signal is', async () => {
    const response = await POST(post({ 'sec-gpc': '1' }));

    expect(response.status).toBe(200);
    expect(mocks.recordConsentBatch.mock.calls[0]?.[1]).toEqual([
      { purpose: NON_ESSENTIAL, granted: false },
      { purpose: ESSENTIAL, granted: true },
    ]);
  });

  it('records what the reader chose when the browser sends no signal', async () => {
    await POST(post({}));

    expect(mocks.recordConsentBatch.mock.calls[0]?.[1]).toEqual([
      { purpose: NON_ESSENTIAL, granted: true },
      { purpose: ESSENTIAL, granted: true },
    ]);
  });
});

describe('POST /api/consent for the account marketing email purpose', () => {
  beforeEach(() => {
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.recordConsentBatch.mockReset().mockResolvedValue([]);
  });

  function decide(granted: boolean, surface: string, headers: Record<string, string> = {}) {
    return POST(
      new Request('http://localhost:3000/api/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
          decisions: [{ purpose: 'marketing_email', granted }],
          surface,
          noticeVersion: CURRENT_NOTICE_VERSION,
        }),
      }) as unknown as Parameters<typeof POST>[0],
    );
  }

  it.each(['web-settings', 'web-consent-centre'])(
    'records a grant and a withdrawal made from %s as marketing_email',
    async (surface) => {
      expect((await decide(true, surface)).status).toBe(200);
      expect((await decide(false, surface)).status).toBe(200);

      expect(mocks.recordConsentBatch.mock.calls).toEqual([
        [
          { kind: 'user', userId: 'user-1' },
          [{ purpose: 'marketing_email', granted: true }],
          surface,
        ],
        [
          { kind: 'user', userId: 'user-1' },
          [{ purpose: 'marketing_email', granted: false }],
          surface,
        ],
      ]);
    },
  );

  it('records a grant as a refusal under Global Privacy Control, and a withdrawal as it was made', async () => {
    await decide(true, 'web-settings', { 'sec-gpc': '1' });
    await decide(false, 'web-settings', { 'sec-gpc': '1' });

    expect(mocks.recordConsentBatch.mock.calls.map(([, decisions]) => decisions)).toEqual([
      [{ purpose: 'marketing_email', granted: false }],
      [{ purpose: 'marketing_email', granted: false }],
    ]);
  });
});
