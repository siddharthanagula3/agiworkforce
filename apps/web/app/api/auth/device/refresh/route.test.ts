import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  issueDeveloperToken: vi.fn(),
  notifyCompromised: vi.fn(),
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
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
vi.mock('@/lib/services/account-activity-notifications', () => ({
  notifyDeviceCredentialCompromised: (...args: unknown[]) => mocks.notifyCompromised(...args),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...args),
  logRateLimitExceeded: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: (_db: unknown, scope: unknown) => ({ scope }),
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
    mocks.notifyCompromised.mockResolvedValue(undefined);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
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

  function replayedRow() {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      family_id: '22222222-2222-4222-8222-222222222222',
      user_id: 'user-1',
      user_email: null,
      device_name: 'Work laptop',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: new Date().toISOString(),
      revoked_at: null,
      owner_missing: false,
      owner_deletion_scheduled_for: null,
      owner_terms_version: CURRENT_TERMS_VERSION,
      owner_terms_accepted_at: new Date().toISOString(),
    };
  }

  it('revokes the whole family when a spent token is replayed', async () => {
    mocks.query.mockResolvedValueOnce([replayedRow()]).mockResolvedValueOnce([{ id: 'revoked-1' }]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
    const revoke = mocks.query.mock.calls[1];
    expect(revoke?.[0]).toMatch(/set revoked_at/);
    expect(revoke?.[1]?.[0]).toBe('22222222-2222-4222-8222-222222222222');
    expect(revoke?.[1]?.[1]).toBe('user-1');
    expect(mocks.issueDeveloperToken).not.toHaveBeenCalled();
  });

  it('records why the family ended, so a theft is not read back as a sign-out', async () => {
    mocks.query.mockResolvedValueOnce([replayedRow()]).mockResolvedValueOnce([{ id: 'revoked-1' }]);

    await POST(request());

    const compromise = mocks.execute.mock.calls.find(([sql]) =>
      /set compromised_at/.test(String(sql)),
    );
    expect(
      compromise,
      'a replayed credential leaves no record of why the family ended',
    ).toBeDefined();
    expect(compromise?.[1]).toEqual([
      '22222222-2222-4222-8222-222222222222',
      'user-1',
      expect.any(String),
      'replayed',
    ]);
  });

  it('leaves the replay in the audit trail, named as a replay', async () => {
    mocks.query.mockResolvedValueOnce([replayedRow()]).mockResolvedValueOnce([{ id: 'revoked-1' }]);

    await POST(request());

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const [event] = mocks.recordAuditEvent.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(event['eventType']).toBe('refresh_family_compromised');
    expect(event['userId']).toBe('user-1');
    expect(event['severity']).toBe('critical');
    expect(event['detail']).toMatchObject({ reason: 'replayed', status: 'recorded' });
    expect(JSON.stringify(event)).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  it('records the rotation of a healthy credential as no security event at all', async () => {
    mocks.query
      .mockResolvedValueOnce([{ ...replayedRow(), used_at: null }])
      .mockResolvedValueOnce([{ id: '33333333-3333-4333-8333-333333333333' }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('tells the account holder, without naming the credential', async () => {
    mocks.query.mockResolvedValueOnce([replayedRow()]).mockResolvedValueOnce([{ id: 'revoked-1' }]);

    await POST(request());

    expect(mocks.notifyCompromised).toHaveBeenCalledTimes(1);
    const [, notice] = mocks.notifyCompromised.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(notice['userId']).toBe('user-1');
    expect(notice['deviceName']).toBe('Work laptop');
    expect(notice['sessionRef']).not.toContain('22222222');
    expect(notice['sessionRef']).not.toContain(CURRENT_TOKEN);
  });

  it('answers the client even when the notice cannot be recorded', async () => {
    mocks.query.mockResolvedValueOnce([replayedRow()]).mockResolvedValueOnce([{ id: 'revoked-1' }]);
    mocks.notifyCompromised.mockRejectedValueOnce(new Error('notifications unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_grant' });
  });

  it('withholds a token from an account that has not accepted the live revision', async () => {
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
    await expect(response.json()).resolves.toMatchObject({
      error: 'terms_acceptance_required',
      terms_version: CURRENT_TERMS_VERSION,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.issueDeveloperToken).not.toHaveBeenCalled();
  });

  it('rejects malformed credentials before opening a transaction', async () => {
    const response = await POST(request('short'));
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
