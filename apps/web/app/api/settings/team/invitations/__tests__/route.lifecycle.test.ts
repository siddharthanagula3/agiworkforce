import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction, mockRequireTeamAdminAccess } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
  mockRequireTeamAdminAccess: vi.fn(),
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
  getClerkAuthUser: vi.fn(async () => ({ userId: 'org-a-admin' })),
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: (...args: unknown[]) => mockRequireTeamAdminAccess(...args),
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
    userId: 'org-a-admin',
    organizationId: null,
  })),
}));

import { GET, POST } from '../route';
import { DELETE as REVOKE, POST as RESEND } from '../[invitationId]/route';
import { POST as ACCEPT } from '../accept/route';
import { hashInvitationToken } from '@/lib/services/organization-invitation-service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const INVITE_ID = '33333333-3333-4333-8333-333333333333';

const adminMembership = {
  organization_id: ORG_A,
  user_id: 'org-a-admin',
  role: 'admin',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-23T00:00:00.000Z',
};

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITE_ID,
    organization_id: ORG_A,
    email: 'invitee@example.com',
    role: 'member',
    status: 'pending',
    token_hash: 'stored-hash',
    invited_by_user_id: 'org-a-admin',
    accepted_by_user_id: null,
    expires_at: '2026-08-12T00:00:00.000Z',
    resent_at: null,
    resend_count: 0,
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

describe('organization invitation lifecycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(0);
    mockRequireTeamAdminAccess.mockResolvedValue({
      plan: 'team',
      canManageTeam: true,
      maxMembers: 10,
      seatsConsumed: 2,
      seatsAvailable: 8,
      seatSource: 'billing',
    });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        query: (...args: unknown[]) => mockQuery(...args),
        execute: (...args: unknown[]) => mockExecute(...args),
      }),
    );
  });

  describe('POST /api/settings/team/invitations (invite)', () => {
    it('persists a pending invitation and returns the link exactly once, without claiming an email was sent', async () => {
      mockQuery
        .mockResolvedValueOnce([adminMembership])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([invitation()]);

      const response = await POST(
        jsonRequest('http://localhost:3000/api/settings/team/invitations', 'POST', {
          organizationId: ORG_A,
          email: 'Invitee@Example.com',
          role: 'member',
        }),
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        invitation: Record<string, unknown>;
        inviteToken: string;
        delivery: { emailSent: boolean; reason: string };
      };

      expect(body.invitation['status']).toBe('pending');
      expect(body.inviteToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      expect(body.invitation).not.toHaveProperty('tokenHash');
      expect(body.delivery.emailSent).toBe(false);
      expect(body.delivery.reason).toMatch(/no transactional email provider/i);

      const insert = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('insert into public.organization_invitations'),
      );
      expect((insert?.[1] as unknown[])[3]).toBe(hashInvitationToken(body.inviteToken));
      expect(insert?.[1]).not.toContain(body.inviteToken);
    });

    it('rejects an owner role on the invitation path', async () => {
      const response = await POST(
        jsonRequest('http://localhost:3000/api/settings/team/invitations', 'POST', {
          organizationId: ORG_A,
          email: 'invitee@example.com',
          role: 'owner',
        }),
      );

      expect(response.status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('refuses to invite into an organization the caller does not administer', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const response = await POST(
        jsonRequest('http://localhost:3000/api/settings/team/invitations', 'POST', {
          organizationId: ORG_B,
          email: 'invitee@example.com',
          role: 'member',
        }),
      );

      expect(response.status).toBe(403);
      expect(mockQuery.mock.calls[0]?.[1]).toEqual([ORG_B, 'org-a-admin']);
      expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
    });

    it('refuses a plain member, so a seat cannot be spent by a non-admin', async () => {
      mockQuery.mockResolvedValueOnce([{ ...adminMembership, role: 'member' }]);

      const response = await POST(
        jsonRequest('http://localhost:3000/api/settings/team/invitations', 'POST', {
          organizationId: ORG_A,
          email: 'invitee@example.com',
          role: 'member',
        }),
      );

      expect(response.status).toBe(403);
    });

    it('surfaces the database seat ceiling as a 409', async () => {
      const ceiling = new Error(
        'violates check constraint "organizations_seats_within_license"',
      ) as Error & { code?: string; constraint?: string };
      ceiling.code = '23514';
      ceiling.constraint = 'organizations_seats_within_license';

      mockQuery
        .mockResolvedValueOnce([adminMembership])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(ceiling);

      const response = await POST(
        jsonRequest('http://localhost:3000/api/settings/team/invitations', 'POST', {
          organizationId: ORG_A,
          email: 'invitee@example.com',
          role: 'member',
        }),
      );

      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toMatch(/no licensed seats available/i);
    });
  });

  describe('GET /api/settings/team/invitations (list)', () => {
    it('expires lapsed invitations first so status and seat count agree', async () => {
      mockQuery
        .mockResolvedValueOnce([adminMembership])
        .mockResolvedValueOnce([invitation()])
        .mockResolvedValueOnce([
          {
            licensed_seats: 10,
            seats_consumed: 3,
            stripe_subscription_id: 'sub_1',
            owner_user_id: 'org-a-owner',
          },
        ]);
      mockExecute.mockResolvedValueOnce(1);

      const response = await GET(
        new Request(
          `http://localhost:3000/api/settings/team/invitations?organizationId=${ORG_A}`,
        ) as never,
      );

      expect(response.status).toBe(200);
      expect(String(mockExecute.mock.calls[0]?.[0]).toLowerCase()).toContain("status = 'expired'");
      expect(mockExecute.mock.calls[0]?.[1]).toEqual([ORG_A]);

      const body = (await response.json()) as {
        invitations: Array<Record<string, unknown>>;
        seats: { seatsAvailable: number };
      };
      expect(body.invitations[0]).not.toHaveProperty('tokenHash');
      expect(body.seats.seatsAvailable).toBe(7);
    });

    it('refuses to list another organization invitations', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const response = await GET(
        new Request(
          `http://localhost:3000/api/settings/team/invitations?organizationId=${ORG_B}`,
        ) as never,
      );

      expect(response.status).toBe(403);
      expect(
        mockQuery.mock.calls.some(([sql]) =>
          String(sql).includes('from public.organization_invitations'),
        ),
      ).toBe(false);
    });
  });

  describe('POST /api/settings/team/invitations/[id] (resend)', () => {
    it('mints a new token on the same row and invalidates the old link', async () => {
      mockQuery
        .mockResolvedValueOnce([adminMembership])
        .mockResolvedValueOnce([invitation()])
        .mockResolvedValueOnce([invitation({ resend_count: 1 })]);

      const response = await RESEND(
        jsonRequest(`http://localhost:3000/api/settings/team/invitations/${INVITE_ID}`, 'POST', {
          organizationId: ORG_A,
          action: 'resend',
        }),
        { params: Promise.resolve({ invitationId: INVITE_ID }) },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { inviteToken: string };

      const update = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('update public.organization_invitations'),
      );
      expect(String(update?.[0])).toContain('resend_count = resend_count + 1');
      expect((update?.[1] as unknown[])[0]).toBe(hashInvitationToken(body.inviteToken));
      expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(false);
    });

    it('refuses to resend an invitation that belongs to another organization', async () => {
      mockQuery.mockResolvedValueOnce([]);

      const response = await RESEND(
        jsonRequest(`http://localhost:3000/api/settings/team/invitations/${INVITE_ID}`, 'POST', {
          organizationId: ORG_B,
          action: 'resend',
        }),
        { params: Promise.resolve({ invitationId: INVITE_ID }) },
      );

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/settings/team/invitations/[id] (revoke)', () => {
    it('revokes a pending invitation, freeing the seat it held', async () => {
      mockQuery
        .mockResolvedValueOnce([adminMembership])
        .mockResolvedValueOnce([invitation({ status: 'revoked' })]);

      const response = await REVOKE(
        new Request(
          `http://localhost:3000/api/settings/team/invitations/${INVITE_ID}?organizationId=${ORG_A}`,
          { method: 'DELETE' },
        ) as never,
        { params: Promise.resolve({ invitationId: INVITE_ID }) },
      );

      expect(response.status).toBe(200);
      const update = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes('update public.organization_invitations'),
      );
      expect(String(update?.[0])).toContain("set status = 'revoked'");
      expect(update?.[1]).toEqual([INVITE_ID, ORG_A]);
    });

    it('reports the real status instead of pretending a used invitation was revoked', async () => {
      mockQuery
        .mockResolvedValueOnce([adminMembership])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ status: 'accepted' }]);

      const response = await REVOKE(
        new Request(
          `http://localhost:3000/api/settings/team/invitations/${INVITE_ID}?organizationId=${ORG_A}`,
          { method: 'DELETE' },
        ) as never,
        { params: Promise.resolve({ invitationId: INVITE_ID }) },
      );

      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toMatch(/already accepted/i);
    });
  });

  describe('POST /api/settings/team/invitations/accept', () => {
    const token = 'raw-invite-token-value-long-enough';

    it('accepts by token and binds membership to the authenticated user', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // claimed-scope bind ahead of the profile lookup
        .mockResolvedValueOnce([{ id: 'invitee-user', email: 'invitee@example.com' }])
        .mockResolvedValueOnce([invitation()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          invitation({ status: 'accepted', accepted_by_user_id: 'org-a-admin' }),
        ]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'accept',
        }),
      );

      expect(response.status).toBe(200);
      const lookup = mockQuery.mock.calls.find(([sql]) => String(sql).includes('token_hash = $1'));
      expect(lookup?.[1]).toEqual([hashInvitationToken(token)]);
      expect(String(lookup?.[0])).not.toContain('organization_id = $2');

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('insert into public.organization_members'),
        [ORG_A, 'org-a-admin', 'member'],
      );
    });

    it('refuses a leaked link opened by an account with a different email', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // claimed-scope bind ahead of the profile lookup
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'someone-else@example.com' }])
        .mockResolvedValueOnce([invitation()]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'accept',
        }),
      );

      expect(response.status).toBe(403);
      expect(
        mockExecute.mock.calls.some(([sql]) =>
          String(sql).includes('insert into public.organization_members'),
        ),
      ).toBe(false);
    });

    it('declines by token and frees the seat without creating a membership', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // claimed-scope bind ahead of the profile lookup
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'invitee@example.com' }])
        .mockResolvedValueOnce([invitation()])
        .mockResolvedValueOnce([invitation({ status: 'declined' })]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'decline',
        }),
      );

      expect(response.status).toBe(200);
      const update = mockQuery.mock.calls.find(([sql]) =>
        String(sql).includes("set status = 'declined'"),
      )!;
      expect(String(update[0])).toContain("set status = 'declined'");
      expect(update[1]).toEqual([INVITE_ID]);
      expect(
        mockExecute.mock.calls.some(([sql]) =>
          String(sql).includes('insert into public.organization_members'),
        ),
      ).toBe(false);
    });

    it('refuses a leaked decline link opened by an account with a different email', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // claimed-scope bind ahead of the profile lookup
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'someone-else@example.com' }])
        .mockResolvedValueOnce([invitation()]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'decline',
        }),
      );

      expect(response.status).toBe(403);
      expect(
        mockQuery.mock.calls.some(([sql]) => String(sql).includes("set status = 'declined'")),
      ).toBe(false);
      expect(
        mockExecute.mock.calls.some(([sql]) =>
          String(sql).includes('insert into public.organization_members'),
        ),
      ).toBe(false);
    });

    it('404s an expired or already-used token', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // claimed-scope bind ahead of the profile lookup
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'invitee@example.com' }])
        .mockResolvedValueOnce([]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'accept',
        }),
      );

      expect(response.status).toBe(404);
      expect(
        mockExecute.mock.calls.some(([sql]) =>
          String(sql).includes('insert into public.organization_members'),
        ),
      ).toBe(false);
    });

    it('never echoes the submitted token back to the caller', async () => {
      mockQuery
        .mockResolvedValueOnce([]) // claimed-scope bind ahead of the profile lookup
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'invitee@example.com' }])
        .mockResolvedValueOnce([]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'accept',
        }),
      );

      expect(await response.text()).not.toContain(token);
    });

    it('binds the profile lookup to the claimed session scope', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'invitee@example.com' }])
        .mockResolvedValueOnce([]);

      await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'accept',
        }),
      );

      expect(mockExecute).toHaveBeenCalledWith('set local role app_rls');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
        ['org-a-admin', ''],
      );
    });

    it('ignores an identity claim smuggled into the request body and binds membership to the session user', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'org-a-admin', email: 'invitee@example.com' }])
        .mockResolvedValueOnce([invitation()])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          invitation({ status: 'accepted', accepted_by_user_id: 'org-a-admin' }),
        ]);

      const response = await ACCEPT(
        jsonRequest('http://localhost:3000/api/settings/team/invitations/accept', 'POST', {
          token,
          action: 'accept',
          userId: 'attacker-controlled-user',
          organizationId: ORG_B,
        }),
      );

      expect(response.status).toBe(200);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('insert into public.organization_members'),
        [ORG_A, 'org-a-admin', 'member'],
      );
      expect(
        mockExecute.mock.calls.some(
          ([, params]) => Array.isArray(params) && params.includes('attacker-controlled-user'),
        ),
      ).toBe(false);
    });
  });
});
