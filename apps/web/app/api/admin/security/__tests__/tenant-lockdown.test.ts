import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/server/data-region', () => ({ managedCloudDataRegion: () => 'us-east-1' }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/request-context-cache', () => ({ setCachedAccountStatus: vi.fn() }));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({ setUserSuspended: vi.fn() }),
}));
vi.mock('@/lib/server/security-log-retention', () => ({ purgeExpiredSecurityAuditLogs: vi.fn() }));
vi.mock('@/lib/services/security-monitoring-service', () => ({ SecurityMonitoringService: {} }));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
  definitions: [] as unknown[],
  overrides: new Map<string, { variant: string }>(),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...(args as [])),
  logSecurityEvent: (...args: unknown[]) => mocks.logSecurityEvent(...(args as [])),
  logRateLimitExceeded: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
}));

vi.mock('@/lib/feature-flags/flag-store', async () => {
  const { killSwitchDefinition } = await import('@/lib/feature-flags/kill-switches');
  return {
    ensureFlagDefinition: async (input: { key: string }) => ({
      ...killSwitchDefinition(input.key, ''),
      version: 1,
      archivedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }),
    upsertFlagOverride: async (
      key: string,
      input: { subjectId: string; variant: string },
    ): Promise<void> => {
      mocks.overrides.set(`${key}:${input.subjectId}`, { variant: input.variant });
    },
    deleteFlagOverride: async (key: string, _subject: string, subjectId: string) =>
      mocks.overrides.delete(`${key}:${subjectId}`) ? 1 : 0,
    listFlagOverrides: async (key: string) =>
      [...mocks.overrides.entries()]
        .filter(([stored]) => stored.startsWith(`${key}:`))
        .map(([stored, value]) => ({
          flagKey: key,
          subject: 'workspace' as const,
          subjectId: stored.slice(key.length + 1),
          variant: value.variant,
          expiresAt: null,
        })),
    getSubjectOverrides: async (_userId: string, workspaceId: string | null, keys: string[]) =>
      keys.flatMap((key) => {
        const stored = workspaceId ? mocks.overrides.get(`${key}:${workspaceId}`) : undefined;
        return stored
          ? [
              {
                flagKey: key,
                subject: 'workspace' as const,
                subjectId: workspaceId as string,
                variant: stored.variant,
                expiresAt: null,
              },
            ]
          : [];
      }),
    getActiveFlagDefinitions: async () => mocks.definitions,
  };
});

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { readKillSwitchGate } from '@/lib/feature-flags/capability-gate';
import { killSwitchDefinition, TENANT_LOCKDOWN_FLAG_KEY } from '@/lib/feature-flags/kill-switches';
import { isTenantLockedDown } from '@/lib/feature-flags/tenant-lockdown';
import { GET, POST } from '../route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const OPERATOR = 'operator_1';
const SECOND_APPROVER = 'operator_2';

function request(action: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/admin/security?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function lockdownBody(patch: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_ID,
    reason: 'tenant isolation incident 412',
    secondApproverUserId: SECOND_APPROVER,
    ...patch,
  };
}

function subject(workspaceId: string | null) {
  return {
    userId: 'user_1',
    workspaceId,
    role: 'member',
    plan: 'pro',
    region: 'us-east-1',
    country: 'US',
    surface: 'web',
    clientVersion: '2.5.0',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overrides.clear();
  mocks.definitions = [
    {
      ...killSwitchDefinition(TENANT_LOCKDOWN_FLAG_KEY, ''),
      version: 1,
      archivedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ];
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: OPERATOR });
  process.env[PLATFORM_ADMIN_ENV_VAR] = `${OPERATOR},${SECOND_APPROVER}`;
});

describe('per-tenant emergency lockdown', () => {
  it('locks one workspace out of every route, agent and model at runtime', async () => {
    const response = await POST(request('lockdown-tenant', lockdownBody()));
    expect(response.status).toBe(200);

    expect(await isTenantLockedDown(ORG_ID)).toBe(true);
    expect(await isTenantLockedDown(OTHER_ORG_ID)).toBe(false);

    const locked = await readKillSwitchGate(subject(ORG_ID));
    const untouched = await readKillSwitchGate(subject(OTHER_ORG_ID));
    expect(locked.tenantLockedDown).toBe(true);
    expect(untouched.tenantLockedDown).toBe(false);
  });

  it('is reversible', async () => {
    await POST(request('lockdown-tenant', lockdownBody()));
    const response = await POST(request('lift-tenant-lockdown', lockdownBody()));

    expect(response.status).toBe(200);
    expect(await isTenantLockedDown(ORG_ID)).toBe(false);
  });

  it('records who locked the workspace, who approved it and why', async () => {
    await POST(request('lockdown-tenant', lockdownBody()));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR,
        severity: 'critical',
        organizationId: ORG_ID,
        detail: expect.objectContaining({
          resourceId: TENANT_LOCKDOWN_FLAG_KEY,
          status: 'locked_down',
          reason: 'tenant isolation incident 412',
          targetUserId: SECOND_APPROVER,
        }),
      }),
    );
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', userId: OPERATOR }),
    );
  });

  it('refuses a lockdown one operator approved alone', async () => {
    const response = await POST(
      request('lockdown-tenant', lockdownBody({ secondApproverUserId: OPERATOR })),
    );

    expect(response.status).toBe(400);
    expect(await isTenantLockedDown(ORG_ID)).toBe(false);
  });

  it('refuses a second approver who is not a platform operator', async () => {
    const response = await POST(
      request('lockdown-tenant', lockdownBody({ secondApproverUserId: 'customer_admin' })),
    );

    expect(response.status).toBe(400);
    expect(await isTenantLockedDown(ORG_ID)).toBe(false);
  });

  it('refuses a lockdown with no workspace or no reason', async () => {
    expect(
      (await POST(request('lockdown-tenant', lockdownBody({ organizationId: 'x' })))).status,
    ).toBe(400);
    expect((await POST(request('lockdown-tenant', lockdownBody({ reason: ' ' })))).status).toBe(
      400,
    );
    expect(await isTenantLockedDown(ORG_ID)).toBe(false);
  });

  it('answers not found when lifting a lockdown nobody engaged', async () => {
    const response = await POST(request('lift-tenant-lockdown', lockdownBody()));
    expect(response.status).toBe(404);
  });

  it('lists the workspaces currently locked down', async () => {
    await POST(request('lockdown-tenant', lockdownBody()));

    const response = await GET(request('lockdowns'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      locked_down_tenants: [{ organizationId: ORG_ID }],
    });
  });

  it('is not reachable by anyone who is not a platform operator', async () => {
    const { createError } = await import('@/lib/errors');
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await POST(request('lockdown-tenant', lockdownBody()));

    expect(response.status).toBe(404);
    expect(await isTenantLockedDown(ORG_ID)).toBe(false);
  });
});
