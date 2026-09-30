import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readSecondFactorStatus: vi.fn(),
  registerSecondFactor: vi.fn(async (..._args: unknown[]) => undefined),
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
  generateBackupCodes: vi.fn(() => ['cccc3333', 'dddd4444']),
}));
vi.mock('@/lib/server/step-up/second-factor', () => ({
  readSecondFactorStatus: (...args: unknown[]) => mocks.readSecondFactorStatus(...args),
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({ registerSecondFactor: mocks.registerSecondFactor }),
  getRequestIdentity: vi.fn(),
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

const ENROLLED = { authenticator: true, backupCodes: true, anySecondFactor: true };

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
    method: 'second_factor',
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '1');
  resetStepUpSigningKeyCache();
  mocks.readSecondFactorStatus.mockResolvedValue(ENROLLED);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/settings/2fa/backup-codes', () => {
  it('refuses with 503 and replaces nothing while authenticator enrollment is unavailable', async () => {
    vi.stubEnv('AGI_AUTHENTICATOR_ENROLLMENT', '');

    const response = await POST(request(grant()));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toBe(
      'Authenticator apps and backup codes are temporarily unavailable.',
    );
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('regenerates backup codes once the second factor has been re-verified', async () => {
    const response = await POST(request(grant()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      backup_codes: ['cccc3333', 'dddd4444'],
    });
  });

  it('refuses a session that has not re-authenticated, and replaces nothing', async () => {
    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
  });

  it('refuses a proof minted for a different action', async () => {
    const otherAction = createStepUpGrant({
      userId: 'user-1',
      action: 'two_factor.disable',
      resourceId: null,
      method: 'second_factor',
    }).token;

    const response = await POST(request(otherAction));

    expect(response.status).toBe(403);
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
  });

  it('writes an audit row saying the backup codes were replaced, and how many', async () => {
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
    await POST(request(grant()));

    expect(mocks.identityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        event: 'backup_codes_regenerated',
        detail: expect.objectContaining({ count: 2 }),
      }),
    );
  });

  it('replaces the whole set the provider holds, so no code from the old one still works', async () => {
    await POST(request(grant()));

    expect(mocks.registerSecondFactor).toHaveBeenCalledWith('user-1', {
      backupCodes: ['cccc3333', 'dddd4444'],
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('never leaks a backup code into the audit detail', async () => {
    await POST(request(grant()));

    const recorded = JSON.stringify([
      ...mocks.recordAuditEvent.mock.calls.map((call) => call[0]),
      ...mocks.identityEvent.mock.calls.map((call) => call[0]),
    ]);
    expect(recorded).not.toContain('cccc3333');
    expect(recorded).not.toContain('dddd4444');
  });

  it('writes no regeneration audit row when the challenge is refused', async () => {
    await POST(request()).catch(() => undefined);

    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'two_factor_backup_codes_regenerated' }),
    );
  });

  it('refuses an account with 2FA off before it asks for a second factor', async () => {
    mocks.readSecondFactorStatus.mockResolvedValueOnce({
      authenticator: false,
      backupCodes: false,
      anySecondFactor: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('stays reachable for a member whose workspace requires two-factor', async () => {
    await POST(request(grant()));

    expect(getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      mfaEnrollment: true,
      resolveOrganization: false,
    });
  });
});
