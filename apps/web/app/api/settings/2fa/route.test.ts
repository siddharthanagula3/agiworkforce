import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  identityEvent: vi.fn(async () => ({
    assessment: { level: 'none', signals: [] },
    response: null,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (event: Record<string, unknown>) => mocks.recordAuditEvent(event),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/identity', () => ({
  getRequestIdentity: vi.fn(async () => null),
  getIdentityProvider: () => ({}),
}));
vi.mock('@/lib/services/identity-events', () => ({
  handleIdentitySecurityEvent: (...args: unknown[]) => mocks.identityEvent(...(args as [])),
}));

process.env['CSRF_SECRET'] = 'two-factor-disable-step-up-secret-long-enough';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';
import { GET, DELETE } from './route';

const ROW = {
  user_id: 'user-1',
  totp_secret_enc: 'enc',
  backup_codes_hashed: ['hash:a'],
  enabled: true,
  enabled_at: '2026-08-01T00:00:00.000Z',
  backup_codes_generated_at: '2026-08-01T00:00:00.000Z',
  last_verified_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

function getRequest() {
  return new NextRequest('http://localhost/api/settings/2fa');
}

function deleteRequest(stepUpToken?: string) {
  return new NextRequest('http://localhost/api/settings/2fa', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      ...(stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {}),
    },
  });
}

function grant(method: 'totp' | 'backup_code' = 'totp') {
  return createStepUpGrant({
    userId: 'user-1',
    action: 'two_factor.disable',
    resourceId: null,
    method,
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
});

describe('GET /api/settings/2fa', () => {
  it('reports enrollment status', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: true });
  });

  it('exempts an organization owner from the mfa gate so status stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await GET(getRequest());

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});

describe('DELETE /api/settings/2fa', () => {
  it('refuses to disable without a fresh second factor, and writes nothing', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_challenged', outcome: 'denied' }),
    );
  });

  it('refuses a proof minted for a different action', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);
    const otherAction = createStepUpGrant({
      userId: 'user-1',
      action: 'account.delete',
      resourceId: null,
      method: 'totp',
    }).token;

    const response = await DELETE(deleteRequest(otherAction));

    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('disables 2FA once the second factor has been re-verified', async () => {
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    const response = await DELETE(deleteRequest(grant()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.query.mock.calls[1]?.[0]).toContain('set enabled = false');
  });

  it('records how the second factor was proven, and tells the account owner', async () => {
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    await DELETE(deleteRequest(grant('backup_code')));

    expect(mocks.identityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        event: 'two_factor_disabled',
        detail: expect.objectContaining({ source: 'backup_code' }),
      }),
    );
  });

  it('stays idempotent for an account that never enrolled, without a challenge', async () => {
    mocks.query.mockResolvedValueOnce([]);

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('exempts an organization owner from the mfa gate so disabling stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([]);

    await DELETE(deleteRequest(grant()));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
