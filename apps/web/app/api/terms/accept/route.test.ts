import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  standing: vi.fn(),
  record: vi.fn(),
  csrf: vi.fn(),
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
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/server/terms', async (importOriginal) => ({
  ...(await importOriginal()),
  CURRENT_TERMS_VERSION: 'current-policy',
  readTermsStanding: (...args: unknown[]) => mocks.standing(...args),
  recordTermsAcceptance: (...args: unknown[]) => mocks.record(...args),
}));

import { GET, POST } from './route';

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
