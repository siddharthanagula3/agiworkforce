import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/terms');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  issueDeveloperToken: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  }),
}));
vi.mock('@/lib/server/developer-token', () => ({
  issueDeveloperToken: (...args: unknown[]) => mocks.issueDeveloperToken(...args),
}));
const policy = vi.hoisted(() => ({
  minRequired: null as string | null,
  effectiveAt: null as string | null,
}));
vi.mock('@/lib/server/terms', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    termsStandingFor: (acceptance: { version: string } | null, now?: Date) =>
      actual.termsStandingFor(acceptance, now, {
        current: actual.CURRENT_TERMS_VERSION,
        minRequired: policy.minRequired,
        minRequiredEffectiveAt: policy.effectiveAt,
      }),
  };
});

import { CURRENT_TERMS_VERSION } from '@/lib/server/terms';
import { POST } from './route';

const REFRESH_TOKEN = 'live-device-refresh-token-with-more-than-forty-characters';
const FAMILY_ID = '22222222-2222-4222-8222-222222222222';

function request() {
  return new NextRequest('https://agiworkforce.com/api/auth/device/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://tauri.localhost' },
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
  });
}

function storedToken(termsVersion: string | null) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    family_id: FAMILY_ID,
    user_id: 'user-1',
    user_email: 'user@example.com',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    used_at: null,
    revoked_at: null,
    owner_missing: false,
    owner_deletion_scheduled_for: null,
    owner_terms_version: termsVersion,
    owner_terms_accepted_at: termsVersion ? new Date().toISOString() : null,
  };
}

describe('device refresh across a terms revision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policy.minRequired = null;
    policy.effectiveAt = null;
    mocks.execute.mockResolvedValue(1);
    mocks.issueDeveloperToken.mockReturnValue({
      accessToken: 'next-access-token',
      expiresIn: 604800,
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mocks.query(...args),
        execute: (...args: unknown[]) => mocks.execute(...args),
      }),
    );
  });

  it('renews an account on an older version and tells the client a new one is published', async () => {
    mocks.query
      .mockResolvedValueOnce([storedToken('2026-01-01')])
      .mockResolvedValueOnce([{ id: '33333333-3333-4333-8333-333333333333' }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Terms-Notice')).toBe(CURRENT_TERMS_VERSION);
    expect(response.headers.get('X-AGI-Terms-Required-From')).toBeNull();
  });

  it('renews an account on the current version with no notice', async () => {
    mocks.query
      .mockResolvedValueOnce([storedToken(CURRENT_TERMS_VERSION)])
      .mockResolvedValueOnce([{ id: '33333333-3333-4333-8333-333333333333' }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Terms-Notice')).toBeNull();
  });

  it('names the deadline while a material revision is inside its grace period', async () => {
    policy.minRequired = CURRENT_TERMS_VERSION;
    policy.effectiveAt = new Date(Date.now() + 86_400_000).toISOString();
    mocks.query
      .mockResolvedValueOnce([storedToken('2026-01-01')])
      .mockResolvedValueOnce([{ id: '33333333-3333-4333-8333-333333333333' }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-AGI-Terms-Required-From')).toBe(policy.effectiveAt);
  });

  it('withholds the token without destroying the session past a material revision deadline', async () => {
    policy.minRequired = CURRENT_TERMS_VERSION;
    policy.effectiveAt = new Date(Date.now() - 1_000).toISOString();
    mocks.query.mockResolvedValueOnce([storedToken('2026-01-01')]);

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'terms_acceptance_required',
      error_description:
        'Accept the Terms of Service at https://agiworkforce.com/login/complete?redirectTo=%2F to keep using AGI Workforce on this device.',
      terms_version: CURRENT_TERMS_VERSION,
      acceptance_url: 'https://agiworkforce.com/login/complete?redirectTo=%2F',
    });
    expect(mocks.issueDeveloperToken).not.toHaveBeenCalled();
    const revokedFamilies = mocks.execute.mock.calls.filter(([sql]) =>
      String(sql).includes('revoked_at'),
    );
    expect(revokedFamilies).toEqual([]);
  });

  it('rotates the very same credential once an account with no acceptance accepts', async () => {
    mocks.query.mockResolvedValueOnce([storedToken(null)]);
    const withheld = await POST(request());
    expect(withheld.status).toBe(403);

    mocks.query.mockReset();
    mocks.query
      .mockResolvedValueOnce([storedToken(CURRENT_TERMS_VERSION)])
      .mockResolvedValueOnce([{ id: '33333333-3333-4333-8333-333333333333' }]);

    const resumed = await POST(request());
    const body = (await resumed.json()) as Record<string, unknown>;

    expect(resumed.status).toBe(200);
    expect(body['access_token']).toBe('next-access-token');
    expect(mocks.issueDeveloperToken).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      sessionFamilyId: FAMILY_ID,
    });
  });
});
