import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

import { hashDeviceRefreshToken } from '@/lib/server/device-refresh-token';
import { CURRENT_TERMS_VERSION } from '@/lib/server/terms';
import { POST } from './route';

const CURRENT_TOKEN = 'current-refresh-token-with-more-than-forty-random-characters';

function request(refreshToken: string = CURRENT_TOKEN) {
  return new NextRequest('https://agiworkforce.com/api/auth/device/refresh', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://tauri.localhost',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

describe('POST /api/auth/device/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('rotates a valid token and stores only the next token hash', async () => {
    mocks.query
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          family_id: '22222222-2222-4222-8222-222222222222',
          user_id: 'user-1',
          user_email: 'user@example.com',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          used_at: null,
          revoked_at: null,
          owner_missing: false,
          owner_deletion_scheduled_for: null,
          owner_terms_version: CURRENT_TERMS_VERSION,
          owner_terms_accepted_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ id: '33333333-3333-4333-8333-333333333333' }]);

    const response = await POST(request());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
    expect(body['access_token']).toBe('next-access-token');
    expect(body['refresh_token']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body['refresh_token']).not.toBe(CURRENT_TOKEN);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([hashDeviceRefreshToken(CURRENT_TOKEN)]);
    expect(mocks.issueDeveloperToken).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      sessionFamilyId: '22222222-2222-4222-8222-222222222222',
    });
    const insertParams = mocks.query.mock.calls[1]?.[1] as unknown[];
    expect(insertParams).not.toContain(body['refresh_token']);
    expect(insertParams[3]).toBe(hashDeviceRefreshToken(String(body['refresh_token'])));
  });

  it('revokes the whole family when a spent token is replayed', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        family_id: '22222222-2222-4222-8222-222222222222',
        user_id: 'user-1',
        user_email: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: new Date().toISOString(),
        revoked_at: null,
        owner_missing: false,
        owner_deletion_scheduled_for: null,
        owner_terms_version: CURRENT_TERMS_VERSION,
        owner_terms_accepted_at: new Date().toISOString(),
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
    expect(mocks.execute.mock.calls[0]?.[0]).toContain('WHERE family_id = $1');
    expect(mocks.execute.mock.calls[0]?.[1]?.[0]).toBe('22222222-2222-4222-8222-222222222222');
    expect(mocks.issueDeveloperToken).not.toHaveBeenCalled();
  });

  it('revokes a refresh family whose account has not accepted the live revision', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        family_id: '22222222-2222-4222-8222-222222222222',
        user_id: 'user-1',
        user_email: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: null,
        revoked_at: null,
        owner_missing: false,
        owner_deletion_scheduled_for: null,
        owner_terms_version: '1970-01-01',
        owner_terms_accepted_at: new Date().toISOString(),
      },
    ]);

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'terms_acceptance_required' });
    expect(mocks.execute.mock.calls[0]?.[0]).toContain('WHERE family_id = $1');
    expect(mocks.issueDeveloperToken).not.toHaveBeenCalled();
  });

  it('rejects malformed credentials before opening a transaction', async () => {
    const response = await POST(request('short'));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
