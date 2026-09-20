import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: Record<string, unknown>) => undefined),
  identityEvent: vi.fn(async (_event: Record<string, unknown>) => ({
    assessment: { level: 'normal', signals: [] },
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
vi.mock('@/features/settings/services/user-preferences', () => ({
  generateBackupCodes: vi.fn(() => ['cccc-3333', 'dddd-4444']),
  hashBackupCode: vi.fn(async (code: string) => `hash:${code}`),
}));
vi.mock('@/lib/server/two-factor-security-events', () => ({
  announceTwoFactorChange: (event: Record<string, unknown>) => mocks.identityEvent(event),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (event: Record<string, unknown>) => mocks.recordAuditEvent(event),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

process.env['CSRF_SECRET'] = 'backup-codes-step-up-secret-long-enough-here';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';
import { POST } from './route';

const ROW = { enabled: true };

function request(stepUpToken?: string) {
  return new NextRequest('http://localhost/api/settings/2fa/backup-codes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {}),
    },
  });
}

function grant() {
  return createStepUpGrant({
    userId: 'user-1',
    action: 'two_factor.regenerate_backup_codes',
    resourceId: null,
    method: 'totp',
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
});

describe('POST /api/settings/2fa/backup-codes', () => {
  it('regenerates backup codes once the second factor has been re-verified', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    const response = await POST(request(grant()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      backup_codes: ['cccc-3333', 'dddd-4444'],
    });
  });

  it('refuses a session that has not re-authenticated, and replaces nothing', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('refuses a proof minted for a different action', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);
    const otherAction = createStepUpGrant({
      userId: 'user-1',
      action: 'two_factor.disable',
      resourceId: null,
      method: 'totp',
    }).token;

    const response = await POST(request(otherAction));

    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('writes an audit row saying the backup codes were replaced, and how many', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request(grant()));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'two_factor_backup_codes_regenerated',
        detail: expect.objectContaining({ resourceType: 'two_factor', count: 2 }),
      }),
    );
  });

  it('tells the account holder the old codes stopped working', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request(grant()));

    expect(mocks.identityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        event: 'backup_codes_regenerated',
        detail: expect.objectContaining({ count: 2 }),
      }),
    );
  });

  it('replaces the whole stored set, so no code from the old one still works', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request(grant()));

    const write = mocks.query.mock.calls.find(([sql]) =>
      /update user_two_factor/i.test(String(sql)),
    );
    expect(String(write?.[0])).toContain('backup_codes_hashed     = $2');
    expect((write?.[1] as unknown[])?.[1]).toEqual(['hash:cccc-3333', 'hash:dddd-4444']);
  });

  it('stores digests rather than the codes the person was shown', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request(grant()));

    const write = mocks.query.mock.calls.find(([sql]) =>
      /update user_two_factor/i.test(String(sql)),
    );
    expect(JSON.stringify(write?.[1])).not.toContain('"cccc-3333"');
  });

  it('never leaks a backup code into the audit detail', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request(grant()));

    const recorded = JSON.stringify([
      ...mocks.recordAuditEvent.mock.calls.map((call) => call[0]),
      ...mocks.identityEvent.mock.calls.map((call) => call[0]),
    ]);
    expect(recorded).not.toContain('cccc-3333');
    expect(recorded).not.toContain('dddd-4444');
  });

  it('writes no regeneration audit row when the challenge is refused', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request()).catch(() => undefined);

    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'two_factor_backup_codes_regenerated' }),
    );
  });

  it('refuses an account with 2FA off before it asks for a second factor', async () => {
    mocks.query.mockResolvedValueOnce([]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('exempts an organization owner from the mfa gate so regeneration stays reachable', async () => {
    mocks.query.mockResolvedValueOnce([ROW]);

    await POST(request(grant()));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaGateExemptForOwner: true,
      resolveOrganization: false,
    });
  });
});
