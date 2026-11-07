import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

process.env['CSRF_SECRET'] = 'leave-step-up-secret-long-enough-here';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';
const LEAVING_OWNER = 'leaving-owner';

const { mockLeaveOrganization, mockGetTeamAdminAccess, recordAuditEvent } = vi.hoisted(() => ({
  mockLeaveOrganization: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  mockGetTeamAdminAccess: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logAuthFailure: vi.fn(async () => undefined),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: LEAVING_OWNER })),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getIdentityProvider: vi.fn(() => ({})),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  invalidateActiveOrganizationCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveActiveOrganizationId: vi.fn(async () => ORGANIZATION_ID),
}));
vi.mock('@/lib/services/organization-membership-service', () => ({
  leaveOrganization: (...args: unknown[]) => mockLeaveOrganization(...args),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: (...args: unknown[]) => mockGetTeamAdminAccess(...args),
}));
vi.mock('@/lib/services/deprovision-service', () => ({
  deprovisionMember: vi.fn(async () => ({
    sessionsRevoked: 0,
    deviceTokensRevoked: 0,
    apiKeysRevoked: 0,
    sharedConnectorsUnshared: 0,
    errors: [],
  })),
}));

import { DELETE } from '../leave/route';
import { deprovisionMember } from '@/lib/services/deprovision-service';
import { ManagedCloudWorkspaceLeaveReceiptSchema } from '@agiworkforce/cloud-contracts';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';

const ACCESS = { plan: 'team', seatSource: 'unprovisioned' };

function grantFor(organizationId: string) {
  return createStepUpGrant({
    userId: LEAVING_OWNER,
    action: 'organization.transfer_ownership',
    resourceId: organizationId,
    method: 'second_factor',
  }).token;
}

function leaveRequest(body: unknown, stepUpToken?: string) {
  return new Request('http://localhost:3000/api/settings/organization/leave', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      ...(stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {}),
    },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
  mockGetTeamAdminAccess.mockResolvedValue(ACCESS);
  vi.mocked(deprovisionMember).mockResolvedValue({
    userId: LEAVING_OWNER,
    organizationId: ORGANIZATION_ID,
    sessionsRevoked: 0,
    sessionsFailed: 0,
    deviceTokensRevoked: 0,
    apiKeysRevoked: 0,
    sharedConnectorsUnshared: 0,
    errors: [],
  });
  mockLeaveOrganization.mockResolvedValue({
    organizationId: ORGANIZATION_ID,
    previousRole: 'owner',
    successorUserId: 'successor-user',
    successorPreviousRole: 'admin',
  });
});

describe('DELETE /api/settings/organization/leave with a successor', () => {
  it('refuses to hand ownership over until the owner re-verifies, before touching membership', async () => {
    const response = await DELETE(leaveRequest({ successorUserId: 'successor-user' }));

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(mockLeaveOrganization).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_challenged', outcome: 'denied' }),
    );
  });

  it('refuses a proof minted for a different workspace', async () => {
    const response = await DELETE(
      leaveRequest({ successorUserId: 'successor-user' }, grantFor(OTHER_ORGANIZATION_ID)),
    );

    expect(response.status).toBe(403);
    expect(mockLeaveOrganization).not.toHaveBeenCalled();
  });

  it('transfers and leaves once the second factor is re-verified for this workspace', async () => {
    const response = await DELETE(
      leaveRequest({ successorUserId: 'successor-user' }, grantFor(ORGANIZATION_ID)),
    );

    expect(response.status).toBe(200);
    const receipt = ManagedCloudWorkspaceLeaveReceiptSchema.parse(await response.json());
    expect(receipt).toEqual({
      organizationId: ORGANIZATION_ID,
      userId: LEAVING_OWNER,
      successorUserId: 'successor-user',
      revoked: { sessions: 0, deviceTokens: 0, apiKeys: 0 },
      sharedConnectorsUnshared: 0,
      warnings: [],
    });
    expect(mockGetTeamAdminAccess).toHaveBeenCalledWith(
      expect.anything(),
      LEAVING_OWNER,
      ORGANIZATION_ID,
    );
    expect(mockLeaveOrganization).toHaveBeenCalledWith(expect.anything(), {
      userId: LEAVING_OWNER,
      organizationId: ORGANIZATION_ID,
      successor: { userId: 'successor-user', organizationAccess: ACCESS },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_satisfied' }),
    );
  });

  it('asks no second factor of a member leaving without naming a successor', async () => {
    mockLeaveOrganization.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      previousRole: 'member',
      successorUserId: null,
      successorPreviousRole: null,
    });

    const response = await DELETE(leaveRequest({}));

    expect(response.status).toBe(200);
    expect(ManagedCloudWorkspaceLeaveReceiptSchema.parse(await response.json())).toMatchObject({
      organizationId: ORGANIZATION_ID,
      userId: LEAVING_OWNER,
      successorUserId: null,
    });
    expect(mockLeaveOrganization).toHaveBeenCalledOnce();
  });

  it('reports the deprovision result counts and warnings without inventing complete cleanup', async () => {
    vi.mocked(deprovisionMember).mockResolvedValue({
      userId: LEAVING_OWNER,
      organizationId: ORGANIZATION_ID,
      sessionsRevoked: 2,
      sessionsFailed: 0,
      deviceTokensRevoked: 0,
      apiKeysRevoked: 1,
      sharedConnectorsUnshared: 0,
      errors: ['Device token cleanup did not finish.'],
    });

    const response = await DELETE(
      leaveRequest({ successorUserId: 'successor-user' }, grantFor(ORGANIZATION_ID)),
    );

    expect(response.status).toBe(200);
    expect(ManagedCloudWorkspaceLeaveReceiptSchema.parse(await response.json())).toEqual({
      organizationId: ORGANIZATION_ID,
      userId: LEAVING_OWNER,
      successorUserId: 'successor-user',
      revoked: { sessions: 2, deviceTokens: 0, apiKeys: 1 },
      sharedConnectorsUnshared: 0,
      warnings: ['Device token cleanup did not finish.'],
    });
    expect(deprovisionMember).toHaveBeenCalledOnce();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'member_removed',
        outcome: 'failure',
        severity: 'critical',
        detail: expect.objectContaining({
          count: 2,
          reason: 'Device token cleanup did not finish.',
        }),
      }),
    );
  });
});
