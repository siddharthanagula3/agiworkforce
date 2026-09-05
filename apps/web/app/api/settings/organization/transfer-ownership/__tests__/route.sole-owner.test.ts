import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
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
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: 10,
    seatsConsumed: 3,
    seatsAvailable: 7,
    seatSource: 'billing',
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockQuery(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
      transaction: (...args: unknown[]) => mockTransaction(...args),
    },
    userId: 'current-owner',
    organizationId: null,
  })),
}));

import { POST } from '../route';
import { PATCH, DELETE } from '@/app/api/settings/team/[memberId]/route';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function member(userId: string, role: string, organizationId = ORG_A) {
  return {
    organization_id: organizationId,
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

describe('POST /api/settings/organization/transfer-ownership', () => {
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

  it('demotes the outgoing owner BEFORE promoting the successor, inside one transaction', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('current-owner', 'owner')])
      .mockResolvedValueOnce([member('successor', 'admin')]);

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();

    const [demote, promote] = mockExecute.mock.calls;
    expect(String(demote?.[0])).toContain('set role = $1');
    expect(demote?.[1]).toEqual(['admin', ORG_A, 'current-owner']);
    expect(String(promote?.[0])).toContain("set role = 'owner'");
    expect(promote?.[1]).toEqual([ORG_A, 'successor']);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('honours the outgoing owner requested role', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('current-owner', 'owner')])
      .mockResolvedValueOnce([member('successor', 'member')]);

    await POST(
      transferRequest({
        organizationId: ORG_A,
        toUserId: 'successor',
        outgoingOwnerRole: 'viewer',
      }),
    );

    expect(mockExecute.mock.calls[0]?.[1]).toEqual(['viewer', ORG_A, 'current-owner']);
  });

  it('refuses an admin who is not the owner', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([member('current-owner', 'admin')]);

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses a successor who is not a member of this organization', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('current-owner', 'owner')])
      .mockResolvedValueOnce([]);

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'stranger' }));

    expect(response.status).toBe(404);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses a caller with no membership in the named organization', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await POST(
      transferRequest({ organizationId: ORG_B, toUserId: 'org-b-member' }),
    );

    expect(response.status).toBe(403);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual([ORG_B, 'current-owner']);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a transfer to yourself instead of no-oping', async () => {
    const response = await POST(
      transferRequest({ organizationId: ORG_A, toUserId: 'current-owner' }),
    );

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('maps the deferred last-owner trigger onto an actionable 409', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('current-owner', 'owner')])
      .mockResolvedValueOnce([member('successor', 'admin')]);
    mockExecute.mockRejectedValueOnce(
      new Error(`organization ${ORG_A} would be left without an owner`),
    );

    const response = await POST(transferRequest({ organizationId: ORG_A, toUserId: 'successor' }));

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/transfer ownership/i);
  });
});

describe('sole-owner protection on the member routes', () => {
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

  it('refuses to promote a second owner and names the transfer flow instead', async () => {
    const memberId = `${ORG_A}:successor`;
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([member('current-owner', 'owner')]);

    const response = await PATCH(
      new Request(`http://localhost:3000/api/settings/team/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'owner' }),
      }) as never,
      { params: Promise.resolve({ memberId }) },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/transfer-ownership/i);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('refuses to remove the last owner', async () => {
    const memberId = `${ORG_A}:current-owner-2`;
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member('current-owner', 'owner')])
      .mockResolvedValueOnce([member('current-owner-2', 'owner')])
      .mockResolvedValueOnce([{ owner_count: '1' }]);

    const response = await DELETE(
      new Request(`http://localhost:3000/api/settings/team/${memberId}`, {
        method: 'DELETE',
      }) as never,
      { params: Promise.resolve({ memberId }) },
    );

    expect(response.status).toBe(409);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
