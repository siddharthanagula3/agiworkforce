import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const permissionRole = vi.hoisted(() => ({
  value: 'viewer' as string | null,
  grants: ['members.manage'] as readonly string[],
}));

vi.mock('@/lib/services/organization-permission-service', async () =>
  (
    await import('@/lib/services/__tests__/organization-permission-service-mock')
  ).organizationPermissionServiceMock(permissionRole as never),
);

const { mockQuery, mockExecute, mockTransaction, recordAuditEvent, createInvitation } = vi.hoisted(
  () => ({
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockTransaction: vi.fn(),
    recordAuditEvent: vi.fn(async () => undefined),
    createInvitation: vi.fn(),
  }),
);

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
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
  })),
}));
vi.mock('@/lib/services/organization-invitation-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createInvitation,
}));
vi.mock('../invitation-email', () => ({
  readOrganizationName: vi.fn(async () => 'Acme'),
  sendInvitationEmail: vi.fn(async () => ({ emailSent: true })),
}));

const adapter = {
  query: (...args: unknown[]) => mockQuery(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args),
};

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => adapter) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: adapter,
    userId: 'actor-user',
    organizationId: null,
  })),
}));

import { POST } from '../route';

const organizationId = '11111111-1111-4111-8111-111111111111';

function inviteRequest(role: string) {
  return new Request('http://localhost:3000/api/settings/team/invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId, email: 'new@acme.test', role }),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionRole.value = 'viewer';
  permissionRole.grants = ['members.manage'];
  mockQuery.mockResolvedValue([
    {
      organization_id: organizationId,
      user_id: 'actor-user',
      role: 'viewer',
      provisioning_source: 'manual',
      provisioned_at: null,
      joined_at: '2026-07-23T00:00:00.000Z',
    },
  ]);
  createInvitation.mockResolvedValue({
    invitation: {
      id: '33333333-3333-4333-8333-333333333333',
      organization_id: organizationId,
      email: 'new@acme.test',
      role: 'admin',
      status: 'pending',
      invited_by_user_id: 'actor-user',
      accepted_by_user_id: null,
      expires_at: '2026-10-01T00:00:00.000Z',
      resent_at: null,
      resend_count: 0,
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z',
    },
    token: 'token',
  });
});

describe('an invitation never carries a role above its inviter', () => {
  it('refuses a viewer granted members.manage who invites an admin', async () => {
    const response = await POST(inviteRequest('admin'));

    expect(response.status).toBe(403);
    expect(createInvitation).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: expect.objectContaining({ message: expect.stringContaining('roles.manage') }),
    });
  });

  it('records the refusal before any invitation row exists', async () => {
    await POST(inviteRequest('admin'));

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied', eventType: 'member_role_changed' }),
    );
  });

  it('lets the same actor seat a member: the member bundle is what joining confers', async () => {
    const response = await POST(inviteRequest('member'));

    expect(response.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledTimes(1);
  });

  it('lets the same actor invite a viewer, which carries only what they hold', async () => {
    permissionRole.grants = ['members.manage', 'content.read'];

    const response = await POST(inviteRequest('viewer'));

    expect(response.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledTimes(1);
  });

  it('leaves an admin inviting an admin alone', async () => {
    permissionRole.value = 'admin';
    permissionRole.grants = [];

    const response = await POST(inviteRequest('admin'));

    expect(response.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledTimes(1);
  });
});
