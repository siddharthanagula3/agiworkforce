import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/step-up/session-proof');

vi.mock('server-only', () => ({}));

const { getUserScopedDb, stepUpLevelFor, readSessionFactorAge, recordAuditEvent } = vi.hoisted(
  () => ({
    getUserScopedDb: vi.fn(),
    stepUpLevelFor: vi.fn(),
    readSessionFactorAge: vi.fn(),
    recordAuditEvent: vi.fn(async () => undefined),
  }),
);

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb }));
vi.mock('@/lib/server/step-up/second-factor', () => ({ stepUpLevelFor }));
vi.mock('@/lib/server/step-up/session-proof', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readSessionFactorAge,
}));

process.env['CSRF_SECRET'] = 'step-up-route-secret-that-is-long-enough';

import { GET, POST } from '../route';
import { verifyStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';

const ORG = '11111111-1111-4111-8111-111111111111';

function grantRequest(body: unknown) {
  return new Request('http://localhost:3000/api/auth/step-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
  getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user_1', organizationId: ORG });
  stepUpLevelFor.mockResolvedValue('second_factor');
});

describe('POST /api/auth/step-up', () => {
  it('mints a proof bound to the caller, action and resource once the session re-verified', async () => {
    readSessionFactorAge.mockResolvedValue({ firstFactorMinutes: 30, secondFactorMinutes: 0 });

    const response = await POST(
      grantRequest({ action: 'organization.transfer_ownership', resourceId: ORG }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; method: string };
    expect(body.method).toBe('second_factor');
    expect(
      verifyStepUpGrant(body.token, {
        userId: 'user_1',
        action: 'organization.transfer_ownership',
        resourceId: ORG,
      }).method,
    ).toBe('second_factor');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_satisfied' }),
    );
  });

  it('asks for a fresh verification at the level the account can give, and mints nothing', async () => {
    readSessionFactorAge.mockResolvedValue({ firstFactorMinutes: 0, secondFactorMinutes: 45 });

    const response = await POST(
      grantRequest({ action: 'organization.transfer_ownership', resourceId: ORG }),
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      token?: string;
      error: { code: string; details: { level: string } };
    };
    expect(body.token).toBeUndefined();
    expect(body.error.code).toBe('STEP_UP_VERIFICATION_REQUIRED');
    expect(body.error.details.level).toBe('second_factor');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('accepts a recent first factor for an account with no second factor', async () => {
    stepUpLevelFor.mockResolvedValue('first_factor');
    readSessionFactorAge.mockResolvedValue({ firstFactorMinutes: 1, secondFactorMinutes: null });

    const response = await POST(grantRequest({ action: 'account.delete' }));

    expect(response.status).toBe(200);
    expect(((await response.json()) as { method: string }).method).toBe('first_factor');
  });

  it('refuses an action that is not in the registry', async () => {
    const response = await POST(grantRequest({ action: 'settings.rename_workspace' }));

    expect(response.status).toBe(400);
    expect(readSessionFactorAge).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/step-up', () => {
  it('reports the verification level and every action it can grant', async () => {
    stepUpLevelFor.mockResolvedValue('first_factor');

    const response = await GET(new Request('http://localhost:3000/api/auth/step-up') as never);

    const body = (await response.json()) as {
      level: string;
      actions: Record<string, { freshnessSeconds: number }>;
    };
    expect(body.level).toBe('first_factor');
    expect(body.actions['organization.transfer_ownership']?.freshnessSeconds).toBe(300);
  });
});
