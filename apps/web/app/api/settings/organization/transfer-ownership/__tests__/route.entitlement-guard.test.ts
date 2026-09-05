import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockQuery,
  mockExecute,
  mockTransaction,
  requireTeamAdminAccess,
  resolveUserPersonalPlanTier,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
  requireTeamAdminAccess: vi.fn(),
  resolveUserPersonalPlanTier: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'current-owner' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({ requireTeamAdminAccess }));
vi.mock('@/lib/services/org-entitlements', () => ({
  resolveUserPersonalPlanTier,
  resolveOrganizationEntitlementPlan: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));

import { POST } from '../route';

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

function transferRequest(body: unknown) {
  return new Request('http://localhost:3000/api/settings/organization/transfer-ownership', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

function queueOwnerAndSuccessor() {
  mockQuery
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([member('current-owner', 'owner')])
    .mockResolvedValueOnce([member('successor', 'admin')]);
}

describe('transfer-ownership entitlement guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(1);
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
    );
  });

  it('refuses the transfer when the organization has no subscription of its own and the successor has no entitlement', async () => {
    requireTeamAdminAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unprovisioned',
    });
    resolveUserPersonalPlanTier.mockResolvedValue('free');
    queueOwnerAndSuccessor();

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('ORG_TRANSFER_ENTITLEMENT_REQUIRED');
    expect(body.error.message).toMatch(/give the new owner a team or enterprise plan/i);
    expect(resolveUserPersonalPlanTier).toHaveBeenCalledWith(expect.anything(), 'successor');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('allows the transfer when the organization has no subscription of its own but the successor already has one', async () => {
    requireTeamAdminAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unprovisioned',
    });
    resolveUserPersonalPlanTier.mockResolvedValue('team');
    queueOwnerAndSuccessor();

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('allows the transfer regardless of the successor plan when the organization carries its own subscription', async () => {
    requireTeamAdminAccess.mockResolvedValue({
      plan: 'enterprise',
      canManageTeam: true,
      maxMembers: 500,
      seatsConsumed: 300,
      seatsAvailable: 200,
      seatSource: 'billing',
    });
    queueOwnerAndSuccessor();

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(200);
    expect(resolveUserPersonalPlanTier).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('refuses the transfer when the organization currently has enterprise_controls through the owner and the successor plan would not carry it forward', async () => {
    requireTeamAdminAccess.mockResolvedValue({
      plan: 'enterprise',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unprovisioned',
    });
    resolveUserPersonalPlanTier.mockResolvedValue('team');
    queueOwnerAndSuccessor();

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; details?: { requiredCapability?: string } };
    };
    expect(body.error.code).toBe('ORG_TRANSFER_ENTITLEMENT_REQUIRED');
    expect(body.error.details?.requiredCapability).toBe('enterprise_controls');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('allows the transfer when the successor plan carries enterprise_controls forward', async () => {
    requireTeamAdminAccess.mockResolvedValue({
      plan: 'enterprise',
      canManageTeam: true,
      maxMembers: null,
      seatsConsumed: null,
      seatsAvailable: null,
      seatSource: 'unprovisioned',
    });
    resolveUserPersonalPlanTier.mockResolvedValue('enterprise');
    queueOwnerAndSuccessor();

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
