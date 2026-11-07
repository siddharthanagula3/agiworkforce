import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const LEAVING_USER = 'leaving-user';

const {
  mockLeaveOrganization,
  mockDeprovisionMember,
  mockRecordAuditEvent,
  mockInvalidateActiveOrganizationCache,
  mockResolveActiveOrganizationId,
  mockGetTeamAdminAccess,
  mockQuery,
  mockGetCachedActiveOrganizationId,
  mockSetCachedActiveOrganizationId,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetCachedActiveOrganizationId: vi.fn(),
  mockSetCachedActiveOrganizationId: vi.fn<(...args: unknown[]) => Promise<void>>(
    async () => undefined,
  ),
  mockGetTeamAdminAccess: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
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
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({ query: mockQuery })) }));
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
  getCachedActiveOrganizationId: (...args: unknown[]) => mockGetCachedActiveOrganizationId(...args),
  setCachedActiveOrganizationId: (...args: unknown[]) => mockSetCachedActiveOrganizationId(...args),
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
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: (...args: unknown[]) => mockGetTeamAdminAccess(...args),
}));
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: (...args: unknown[]) => mockDeprovisionMember(...args),
}));

import { DELETE } from '../leave/route';

function request(body: unknown = {}) {
  return new Request('http://localhost:3000/api/settings/organization/leave', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

  it.each([undefined, '', '{}'])('retains empty-body leave compatibility for %j', async (body) => {
    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/organization/leave', {
        method: 'DELETE',
        body,
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mockLeaveOrganization).toHaveBeenCalledOnce();
    expect(mockDeprovisionMember).toHaveBeenCalledOnce();
  });

  function expectNoLeave() {
    expect(mockResolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(mockLeaveOrganization).not.toHaveBeenCalled();
    expect(mockDeprovisionMember).not.toHaveBeenCalled();
    expect(mockInvalidateActiveOrganizationCache).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
    expect(mockGetTeamAdminAccess).not.toHaveBeenCalled();
  }

  it.each([
    '{',
    '{"successorUserId":"successor",',
    ' \t\r\n ',
    'null',
    '[]',
    '{"successorUserId":1}',
  ])('refuses invalid input %j before membership or deprovisioning actions', async (body) => {
    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/organization/leave', {
        method: 'DELETE',
        body,
      }) as never,
    );

    expect(response.status).toBe(400);
    expectNoLeave();
  });

  it('propagates a failed body read before membership or deprovisioning actions', async () => {
    const unreadable = new Request('http://localhost:3000/api/settings/organization/leave', {
      method: 'DELETE',
    });
    vi.spyOn(unreadable, 'text').mockRejectedValueOnce(new Error('Body transport failed'));

    const response = await DELETE(unreadable as never);

    expect(response.status).toBe(500);
    expectNoLeave();
  });

  it('propagates a stream failure before membership or deprovisioning actions', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('Body transport failed'));
      },
    });
    const init: RequestInit & { duplex: 'half' } = { method: 'DELETE', body, duplex: 'half' };

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/organization/leave', init) as never,
    );

    expect(response.status).toBe(500);
    expectNoLeave();
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

  it('does not read organization access for a member leaving without a successor', async () => {
    await DELETE(request());

    expect(mockGetTeamAdminAccess).not.toHaveBeenCalled();
    expect(mockLeaveOrganization).toHaveBeenCalledWith(expect.anything(), {
      userId: LEAVING_USER,
      organizationId: ORGANIZATION_ID,
    });
  });

  describe('workspace selection with the real resolver', () => {
    const OTHER_ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';
    const NONMEMBER_ORGANIZATION_ID = '44444444-4444-4444-8444-444444444444';

    beforeEach(async () => {
      const actual = await vi.importActual<
        typeof import('@/lib/services/active-workspace-service')
      >('@/lib/services/active-workspace-service');
      mockResolveActiveOrganizationId.mockImplementation((...args) => {
        const input = args as Parameters<typeof actual.resolveActiveOrganizationId>;
        return actual.resolveActiveOrganizationId(...input);
      });
      mockGetCachedActiveOrganizationId.mockResolvedValue(OTHER_ORGANIZATION_ID);
      mockQuery.mockImplementation(async (_sql: string, parameters: unknown[]) => {
        const organizationId = parameters[0];
        return organizationId === ORGANIZATION_ID || organizationId === OTHER_ORGANIZATION_ID
          ? [{ organization_id: organizationId }]
          : [];
      });
    });

    function selectedRequest(selector?: string) {
      return new Request('http://localhost:3000/api/settings/organization/leave', {
        method: 'DELETE',
        headers: selector === undefined ? {} : { [MANAGED_CLOUD_ORGANIZATION_HEADER]: selector },
      }) as never;
    }

    it('leaves explicit A even when the account currently selects B', async () => {
      const response = await DELETE(selectedRequest(ORGANIZATION_ID));

      expect(response.status).toBe(200);
      expect(mockGetCachedActiveOrganizationId).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
        ORGANIZATION_ID,
        LEAVING_USER,
      ]);
      expect(mockLeaveOrganization).toHaveBeenCalledWith(expect.anything(), {
        userId: LEAVING_USER,
        organizationId: ORGANIZATION_ID,
      });
      expect(mockDeprovisionMember).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        userId: LEAVING_USER,
        organizationId: ORGANIZATION_ID,
      });
    });

    it.each([
      ['not-a-workspace', 400],
      [NONMEMBER_ORGANIZATION_ID, 403],
      [MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE, 404],
    ] as const)('refuses selector %s without falling back to B', async (selector, status) => {
      const response = await DELETE(selectedRequest(selector));

      expect(response.status).toBe(status);
      expect(mockGetCachedActiveOrganizationId).not.toHaveBeenCalled();
      if (selector === NONMEMBER_ORGANIZATION_ID) {
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
          NONMEMBER_ORGANIZATION_ID,
          LEAVING_USER,
        ]);
      } else {
        expect(mockQuery).not.toHaveBeenCalled();
      }
      expect(mockLeaveOrganization).not.toHaveBeenCalled();
      expect(mockDeprovisionMember).not.toHaveBeenCalled();
      expect(mockInvalidateActiveOrganizationCache).not.toHaveBeenCalled();
      expect(mockRecordAuditEvent).not.toHaveBeenCalled();
      expect(mockGetTeamAdminAccess).not.toHaveBeenCalled();
    });

    it('retains headerless bodyless compatibility using the current selection B', async () => {
      mockLeaveOrganization.mockResolvedValue({
        organizationId: OTHER_ORGANIZATION_ID,
        previousRole: 'member',
        successorUserId: null,
        successorPreviousRole: null,
      });

      const response = await DELETE(selectedRequest());

      expect(response.status).toBe(200);
      expect(mockGetCachedActiveOrganizationId).toHaveBeenCalledWith(LEAVING_USER);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
        OTHER_ORGANIZATION_ID,
        LEAVING_USER,
      ]);
      expect(mockLeaveOrganization).toHaveBeenCalledWith(expect.anything(), {
        userId: LEAVING_USER,
        organizationId: OTHER_ORGANIZATION_ID,
      });
      expect(mockDeprovisionMember).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        userId: LEAVING_USER,
        organizationId: OTHER_ORGANIZATION_ID,
      });
    });
  });
});
