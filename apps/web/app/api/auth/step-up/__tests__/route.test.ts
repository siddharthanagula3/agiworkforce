import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getUserScopedDb, verifySecondFactor, hasEnrolledSecondFactor, recordAuditEvent } =
  vi.hoisted(() => ({
    getUserScopedDb: vi.fn(),
    verifySecondFactor: vi.fn(),
    hasEnrolledSecondFactor: vi.fn(),
    recordAuditEvent: vi.fn(async () => undefined),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb }));
vi.mock('@/lib/server/step-up/verify-factor', () => ({
  verifySecondFactor,
  hasEnrolledSecondFactor,
}));

process.env['CSRF_SECRET'] = 'step-up-route-secret-that-is-long-enough';

import { GET, POST } from '../route';
import { verifyStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';

const ORG = '11111111-1111-4111-8111-111111111111';

function challenge(body: unknown) {
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
});

describe('POST /api/auth/step-up', () => {
  it('mints a proof bound to the caller, action and resource', async () => {
    verifySecondFactor.mockResolvedValue({ ok: true, method: 'totp' });

    const response = await POST(
      challenge({ action: 'organization.transfer_ownership', resourceId: ORG, code: '123456' }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; method: string };
    expect(body.method).toBe('totp');
    expect(
      verifyStepUpGrant(body.token, {
        userId: 'user_1',
        action: 'organization.transfer_ownership',
        resourceId: ORG,
      }).method,
    ).toBe('totp');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_satisfied' }),
    );
  });

  it('records a rejected attempt and mints nothing', async () => {
    verifySecondFactor.mockResolvedValue({ ok: false, failure: 'invalid_code' });

    const response = await POST(
      challenge({ action: 'organization.transfer_ownership', resourceId: ORG, code: '000000' }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty('token');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'step_up_failed',
        outcome: 'failure',
        detail: expect.objectContaining({ reason: 'invalid_code' }),
      }),
    );
  });

  it('answers an unenrolled account with a conflict rather than a bad code', async () => {
    verifySecondFactor.mockResolvedValue({ ok: false, failure: 'not_enrolled' });

    const response = await POST(challenge({ action: 'account.delete', code: '123456' }));

    expect(response.status).toBe(409);
  });

  it('refuses an action that is not in the registry', async () => {
    const response = await POST(challenge({ action: 'settings.rename_workspace', code: '123456' }));

    expect(response.status).toBe(400);
    expect(verifySecondFactor).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/step-up', () => {
  it('reports whether the caller can satisfy a challenge at all', async () => {
    hasEnrolledSecondFactor.mockResolvedValue(false);

    const response = await GET(new Request('http://localhost:3000/api/auth/step-up') as never);

    const body = (await response.json()) as {
      enrolled: boolean;
      actions: Record<string, { freshnessSeconds: number }>;
    };
    expect(body.enrolled).toBe(false);
    expect(body.actions['organization.transfer_ownership']?.freshnessSeconds).toBe(300);
  });
});
