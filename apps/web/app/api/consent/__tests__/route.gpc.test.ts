import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_PURPOSES, CONSENT_SURFACES } from '@/lib/consent-purposes';

const mocks = vi.hoisted(() => ({
  recordConsentBatch: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-auth')>()),
  getClerkAuthUser: mocks.getClerkAuthUser,
}));
vi.mock('@/lib/server/consent-records', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/consent-records')>()),
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
