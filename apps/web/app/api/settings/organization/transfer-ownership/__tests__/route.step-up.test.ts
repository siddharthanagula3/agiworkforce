import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction, requireTeamAdminAccess, recordAuditEvent } =
  vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockTransaction: vi.fn(),
    requireTeamAdminAccess: vi.fn(),
    recordAuditEvent: vi.fn(async () => undefined),
  }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
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
  getClerkAuthUser: vi.fn(async () => ({ userId: 'current-owner' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({ requireTeamAdminAccess }));
vi.mock('@/lib/services/org-entitlements', () => ({
  resolveUserPersonalPlanTier: vi.fn(async () => 'enterprise'),
  resolveOrganizationEntitlementPlan: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));

process.env['CSRF_SECRET'] = 'transfer-step-up-secret-long-enough-here';

import { POST } from '../route';
import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function member(userId: string, role: string) {
  return {
    organization_id: ORG_A,
    user_id: userId,
    role,
    provisioning_source: 'manual',
    provisioned_at: null,
    joined_at: '2026-07-23T00:00:00.000Z',
  };
}

function transferRequest(stepUpToken?: string) {
  return new Request('http://localhost:3000/api/settings/organization/transfer-ownership', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {}),
    },
    body: JSON.stringify({ organizationId: ORG_A, toUserId: 'successor' }),
  }) as never;
}

function grantFor(organizationId: string, userId = 'current-owner') {
  return createStepUpGrant({
    userId,
    action: 'organization.transfer_ownership',
    resourceId: organizationId,
    method: 'totp',
  }).token;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
  mockExecute.mockResolvedValue(1);
  mockQuery
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([member('current-owner', 'owner')])
    .mockResolvedValueOnce([member('successor', 'admin')]);
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      query: (...args: unknown[]) => mockQuery(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
  );
  requireTeamAdminAccess.mockResolvedValue({ plan: 'enterprise', seatSource: 'billing' });
});

describe('transfer-ownership step-up', () => {
  it('refuses a session that has not re-authenticated, before it reads any membership', async () => {
    const response = await POST(transferRequest());

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'STEP_UP_REQUIRED',
    );
    expect(requireTeamAdminAccess).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_challenged', outcome: 'denied' }),
    );
  });

  it('refuses a proof minted for a different workspace', async () => {
    const response = await POST(transferRequest(grantFor('22222222-2222-4222-8222-222222222222')));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('completes the transfer once the second factor has been re-verified', async () => {
    const response = await POST(transferRequest(grantFor(ORG_A)));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownerUserId: 'successor' });
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'step_up_satisfied' }),
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'member_role_changed' }),
    );
  });
});
