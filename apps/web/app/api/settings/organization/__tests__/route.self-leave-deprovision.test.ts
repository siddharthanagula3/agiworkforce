import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const LEAVING_USER = 'leaving-user';

const {
  mockLeaveOrganization,
  mockDeprovisionMember,
  mockRecordAuditEvent,
  mockInvalidateActiveOrganizationCache,
  mockResolveActiveOrganizationId,
} = vi.hoisted(() => ({
  mockLeaveOrganization: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockDeprovisionMember: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockRecordAuditEvent: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  mockInvalidateActiveOrganizationCache: vi.fn<(...args: unknown[]) => Promise<void>>(
    async () => undefined,
  ),
  mockResolveActiveOrganizationId: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'leaving-user' })),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getIdentityProvider: vi.fn(() => ({})),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditEvent: (...args: unknown[]) => mockRecordAuditEvent(...args),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invalidateActiveOrganizationCache: (...args: unknown[]) =>
    mockInvalidateActiveOrganizationCache(...args),
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveActiveOrganizationId: (...args: unknown[]) => mockResolveActiveOrganizationId(...args),
}));
vi.mock('@/lib/services/organization-membership-service', () => ({
  leaveOrganization: (...args: unknown[]) => mockLeaveOrganization(...args),
}));
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: (...args: unknown[]) => mockDeprovisionMember(...args),
}));

import { DELETE } from '../leave/route';

function request() {
  return new Request('http://localhost:3000/api/settings/organization/leave', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }) as never;
}

function deprovisionResult(errors: string[] = []) {
  return {
    userId: LEAVING_USER,
    organizationId: ORGANIZATION_ID,
    sessionsRevoked: 3,
    sessionsFailed: errors.length,
    deviceTokensRevoked: 2,
    apiKeysRevoked: 1,
    sharedConnectorsUnshared: 4,
    errors,
  };
}

describe('DELETE /api/settings/organization/leave deprovisions the departing member', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveActiveOrganizationId.mockResolvedValue(ORGANIZATION_ID);
    mockLeaveOrganization.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      previousRole: 'member',
      successorUserId: null,
      successorPreviousRole: null,
    });
    mockDeprovisionMember.mockResolvedValue(deprovisionResult());
  });

  it('revokes the leaver credentials and unshares their connectors', async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mockDeprovisionMember).toHaveBeenCalledTimes(1);
    expect(mockDeprovisionMember).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      userId: LEAVING_USER,
      organizationId: ORGANIZATION_ID,
    });

    const body = await response.json();
    expect(body.revoked).toEqual({ sessions: 3, deviceTokens: 2, apiKeys: 1 });
    expect(body.warnings).toEqual([]);
  });

  it('deprovisions after the membership row is gone, never before', async () => {
    const order: string[] = [];
    mockLeaveOrganization.mockImplementation(async () => {
      order.push('leave');
      return {
        organizationId: ORGANIZATION_ID,
        previousRole: 'member',
        successorUserId: null,
        successorPreviousRole: null,
      };
    });
    mockDeprovisionMember.mockImplementation(async () => {
      order.push('deprovision');
      return deprovisionResult();
    });

    await DELETE(request());

    expect(order).toEqual(['leave', 'deprovision']);
  });

  it('drops the cached active organization for the leaver', async () => {
    await DELETE(request());

    expect(mockInvalidateActiveOrganizationCache).toHaveBeenCalledWith(LEAVING_USER);
  });

  it('reports credentials it could not revoke instead of claiming a clean exit', async () => {
    const warning = '1 session(s) could not be revoked and may still be live.';
    mockDeprovisionMember.mockResolvedValue(deprovisionResult([warning]));

    const response = await DELETE(request());
    const body = await response.json();

    expect(body.warnings).toEqual([warning]);

    const auditCall = mockRecordAuditEvent.mock.calls.find(
      (call) => (call[0] as { eventType?: string } | undefined)?.eventType === 'member_removed',
    );
    expect(auditCall).toBeDefined();
    expect(auditCall?.[0]).toMatchObject({ outcome: 'failure', severity: 'critical' });
  });

  it('does not deprovision when leaving fails', async () => {
    mockLeaveOrganization.mockRejectedValue(new Error('membership changed'));

    await DELETE(request());

    expect(mockDeprovisionMember).not.toHaveBeenCalled();
  });
});
