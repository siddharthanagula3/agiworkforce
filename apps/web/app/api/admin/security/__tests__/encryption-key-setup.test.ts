import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/request-context-cache', () => ({ setCachedAccountStatus: vi.fn() }));
vi.mock('@/lib/server/identity', () => ({
  getIdentityUser: vi.fn(async () => null),
  getIdentityProvider: () => ({ setUserSuspended: vi.fn() }),
}));
vi.mock('@/lib/server/security-log-retention', () => ({ purgeExpiredSecurityAuditLogs: vi.fn() }));
vi.mock('@/lib/services/security-monitoring-service', () => ({ SecurityMonitoringService: {} }));
vi.mock('@/lib/feature-flags/tenant-lockdown', () => ({
  lockdownTenant: vi.fn(),
  liftTenantLockdown: vi.fn(),
  listLockedDownTenants: vi.fn(async () => []),
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  logSecurityEvent: vi.fn(async () => undefined),
  validate: vi.fn(),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  logSecurityEvent: (...args: unknown[]) => mocks.logSecurityEvent(...(args as [])),
  logRateLimitExceeded: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
}));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  validateOrganizationKeySetup: (...args: unknown[]) => mocks.validate(...(args as [])),
}));

import { POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function req(body: unknown): NextRequest {
  return new NextRequest(
    new Request('https://app.test/api/admin/security?action=validate-encryption-key', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'user_operator' });
  mocks.validate.mockResolvedValue({
    ok: true,
    descriptor: {
      provider: 'aws_kms',
      keyUri: 'arn:aws:kms:us-east-1:1:key/a',
      region: 'us-east-1',
    },
    checks: [{ id: 'provider_client', label: 'x', state: 'pass', detail: null }],
  });
});

describe('validating a workspace key before it is activated', () => {
  it('reports the key as usable and records the check', async () => {
    const res = await POST(
      req({
        organizationId: ORG,
        provider: 'aws_kms',
        keyUri: 'arn:aws:kms:us-east-1:123456789012:key/2f1c-aaaa',
        region: 'us-east-1',
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { usable: boolean; checks: unknown[] };
    expect(body.usable).toBe(true);
    expect(body.checks).toHaveLength(1);
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'admin_action', severity: 'low' }),
    );
  });

  it('reports an unusable key without turning it into a 500', async () => {
    mocks.validate.mockResolvedValue({
      ok: false,
      descriptor: {
        provider: 'aws_kms',
        keyUri: 'arn:aws:kms:us-east-1:1:key/a',
        region: 'us-east-1',
      },
      checks: [
        { id: 'generate_data_key', label: 'x', state: 'fail', detail: 'AccessDeniedException' },
      ],
    });

    const res = await POST(
      req({
        organizationId: ORG,
        provider: 'aws_kms',
        keyUri: 'arn:aws:kms:us-east-1:123456789012:key/2f1c-aaaa',
        region: 'us-east-1',
      }),
    );

    expect(res.status).toBe(200);
    expect(((await res.json()) as { usable: boolean }).usable).toBe(false);
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'medium' }),
    );
  });

  it('refuses a provider this build has no adapter for, before any KMS call', async () => {
    const res = await POST(
      req({ organizationId: ORG, provider: 'hsm', keyUri: 'x', region: 'us-east-1' }),
    );

    expect(res.status).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('refuses a malformed workspace id', async () => {
    const res = await POST(
      req({ organizationId: 'not-a-uuid', provider: 'local', keyUri: 'local://a', region: 'us' }),
    );
    expect(res.status).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('answers 503 with Retry-After when the database is unreachable, not a bare 500', async () => {
    // The one answer the gateway wrapper cannot shape, so it is the one worth
    // holding onto through the move onto withErrorHandler.
    mocks.validate.mockRejectedValue(new Error('fetch failed'));

    const res = await POST(
      req({ organizationId: ORG, provider: 'local', keyUri: 'local://a', region: 'us-east-1' }),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(JSON.stringify(await res.json())).toMatch(/Database temporarily unavailable/);
  });

  it('answers 404 to anyone who is not a platform operator', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found'));

    const res = await POST(
      req({ organizationId: ORG, provider: 'local', keyUri: 'local://a', region: 'us-east-1' }),
    );

    expect(res.status).toBe(404);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
