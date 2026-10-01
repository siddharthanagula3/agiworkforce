import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { OrganizationRole } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/csrf');
type ScanModule3 = typeof import('@/lib/security-audit');
type ScanModule4 = typeof import('@/lib/server/neon-db');
type ScanModule5 = typeof import('@/lib/server/rls-db');
type ScanModule6 = typeof import('@/lib/server/request-context-cache');
type ScanModule7 = typeof import('@/lib/services/organization-permission-service');
type ScanModule8 = typeof import('@/lib/services/organization-invitation-service');

vi.mock('server-only', () => ({}));

const session = vi.hoisted(() => ({ userId: 'user-admin', role: 'admin' as OrganizationRole }));
const state = vi.hoisted(() => ({ db: null as unknown }));
const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  csrf: vi.fn(async (_request: unknown): Promise<Response | null> => null),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  teamAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
  createInvitation: vi.fn(),
  expirePendingInvitations: vi.fn(async () => 0),
  listInvitationPage: vi.fn(),
  sendInvitationEmail: vi.fn(),
  readOrganizationName: vi.fn(async () => 'Northwind'),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  getNeonDb: () => state.db,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  ...(await import('../../__tests__/workspace-admin-api-world')).permissionServiceMock(session),
}));
vi.mock('@/lib/services/organization-invitation-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  createInvitation: mocks.createInvitation,
  expirePendingInvitations: mocks.expirePendingInvitations,
  listInvitationPage: mocks.listInvitationPage,
}));
vi.mock('@/app/api/settings/team/invitations/invitation-email', () => ({
  sendInvitationEmail: mocks.sendInvitationEmail,
  readOrganizationName: mocks.readOrganizationName,
}));
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  getTeamAdminAccess: mocks.teamAccess,
  requireTeamAdminAccess: mocks.teamAccess,
}));

import { createError } from '@/lib/errors';
import { clearIpAllowListCacheForTests } from '@/lib/services/organization-ip-allow-list-cache';
import {
  KEY_ACTOR,
  KEY_ID,
  ORG,
  createWorkspaceAdminDb,
  defaultWorld,
  keyHeaders,
  type WorkspaceAdminWorld,
} from '../../__tests__/workspace-admin-api-world';
import { GET, POST } from '../route';

const URL_BASE = 'https://app.test/api/settings/organization/invitations';
const INVITE_ID = '55555555-5555-4555-8555-555555555555';
const SECOND_INVITE_ID = '66666666-6666-4666-8666-666666666666';

let world: WorkspaceAdminWorld;

function invitationRow(over: Record<string, unknown> = {}) {
  return {
    id: INVITE_ID,
    organization_id: ORG,
    email: 'new.person@example.com',
    role: 'member',
    status: 'pending',
    token_hash: 'stored-token-hash',
    invited_by_user_id: 'user-admin',
    accepted_by_user_id: null,
    expires_at: '2026-10-04T00:00:00.000Z',
    resent_at: null,
    resend_count: 0,
    created_at: '2026-09-27T00:00:00.000Z',
    updated_at: '2026-09-27T00:00:00.000Z',
    ...over,
  };
}

function get(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`${URL_BASE}${query}`, { headers });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function invitedEvent() {
  return mocks.recordAuditEvent.mock.calls
    .map(([event]) => event as Record<string, unknown>)
    .find((event) => event['eventType'] === 'member_invited');
}

beforeEach(() => {
  vi.clearAllMocks();
  clearIpAllowListCacheForTests();
  session.userId = 'user-admin';
  session.role = 'admin';
  world = defaultWorld();
  state.db = createWorkspaceAdminDb(world);
  mocks.getUserScopedDb.mockImplementation(async () => ({
    db: state.db,
    userId: session.userId,
    organizationId: ORG,
  }));
  mocks.csrf.mockResolvedValue(null);
  mocks.teamAccess.mockResolvedValue({ plan: 'enterprise', canManageTeam: true });
  mocks.expirePendingInvitations.mockResolvedValue(0);
  mocks.readOrganizationName.mockResolvedValue('Northwind');
  mocks.listInvitationPage.mockResolvedValue({
    rows: [invitationRow(), invitationRow({ id: SECOND_INVITE_ID, email: 'second@example.com' })],
    hasMore: true,
  });
  mocks.createInvitation.mockImplementation(
    async (_db: unknown, input: { email: string; role: string; invitedByUserId: string }) => ({
      invitation: invitationRow({
        email: input.email,
        role: input.role,
        invited_by_user_id: input.invitedByUserId,
      }),
      token: 'invite-token-abcdefghijklmnopqrstuv',
    }),
  );
  mocks.sendInvitationEmail.mockResolvedValue({ emailSent: true });
});

describe('GET /api/settings/organization/invitations', () => {
  it('refuses a caller with neither a session nor a workspace API key', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    expect((await GET(get())).status).toBe(401);
  });

  it('expires stale invitations, then lists a page without any token material', async () => {
    const response = await GET(get());

    expect(response.status).toBe(200);
    const page = (await response.json()) as {
      data: Array<{ id: string; email: string; status: string }>;
      hasMore: boolean;
      firstId: string;
      lastId: string;
    };
    expect(mocks.expirePendingInvitations).toHaveBeenCalledWith(state.db, ORG);
    expect(mocks.expirePendingInvitations.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listInvitationPage.mock.invocationCallOrder[0]!,
    );
    expect(mocks.listInvitationPage).toHaveBeenCalledWith(state.db, ORG, {
      limit: 20,
      afterId: null,
    });
    expect(page).toMatchObject({ hasMore: true, firstId: INVITE_ID, lastId: SECOND_INVITE_ID });
    expect(page.data[0]).toMatchObject({ email: 'new.person@example.com', status: 'pending' });
    expect(JSON.stringify(page)).not.toMatch(/token_hash|stored-token-hash/);
  });

  it('forwards limit and afterId to the page read', async () => {
    await GET(get(`?limit=5&afterId=${INVITE_ID}`));

    expect(mocks.listInvitationPage).toHaveBeenCalledWith(state.db, ORG, {
      limit: 5,
      afterId: INVITE_ID,
    });
  });

  it.each([['?limit=0'], ['?limit=101'], ['?afterId=not-a-uuid'], ['?status=pending']])(
    'rejects the malformed query %s',
    async (query) => {
      expect((await GET(get(query))).status).toBe(400);
      expect(mocks.listInvitationPage).not.toHaveBeenCalled();
    },
  );

  it('serves a workspace API key scoped for members', async () => {
    const response = await GET(get('', keyHeaders()));

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses a workspace API key scoped only for billing', async () => {
    world.keyScopes = ['admin.billing.view'];

    const response = await GET(get('', keyHeaders()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('not scoped for admin.members.view');
    expect(mocks.listInvitationPage).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/organization/invitations', () => {
  it('invites a member, returns the link once and records the invitation', async () => {
    const response = await POST(post({ email: 'new.person@example.com' }));

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      invitation: { id: string; role: string; email: string };
      inviteToken: string;
      delivery: { emailSent: boolean };
    };
    expect(body).toMatchObject({
      invitation: { id: INVITE_ID, role: 'member', email: 'new.person@example.com' },
      inviteToken: 'invite-token-abcdefghijklmnopqrstuv',
      delivery: { emailSent: true },
    });
    expect(mocks.createInvitation).toHaveBeenCalledWith(state.db, {
      organizationId: ORG,
      email: 'new.person@example.com',
      role: 'member',
      invitedByUserId: 'user-admin',
    });
    expect(mocks.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new.person@example.com',
        token: 'invite-token-abcdefghijklmnopqrstuv',
        organizationName: 'Northwind',
        sender: { db: state.db, userId: 'user-admin' },
      }),
    );
    expect(invitedEvent()).toMatchObject({
      userId: 'user-admin',
      organizationId: ORG,
      surface: undefined,
      detail: expect.objectContaining({
        resourceId: INVITE_ID,
        role: 'member',
        source: undefined,
      }),
    });
  });

  it('lets an admin invite another admin', async () => {
    const response = await POST(post({ email: 'second.admin@example.com', role: 'admin' }));

    expect(response.status).toBe(201);
    expect(mocks.createInvitation).toHaveBeenCalledWith(
      state.db,
      expect.objectContaining({ role: 'admin' }),
    );
  });

  it('lets a workspace API key invite a viewer and marks the event as the key', async () => {
    const response = await POST(
      post({ email: 'contractor@example.com', role: 'viewer' }, keyHeaders()),
    );

    expect(response.status).toBe(201);
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(mocks.createInvitation).toHaveBeenCalledWith(
      state.db,
      expect.objectContaining({ role: 'viewer', invitedByUserId: KEY_ACTOR }),
    );
    expect(invitedEvent()).toMatchObject({
      userId: KEY_ACTOR,
      surface: 'api',
      detail: expect.objectContaining({ source: `admin_api_key:${KEY_ID}` }),
    });
  });

  it('never lets a workspace API key invite an admin', async () => {
    const response = await POST(post({ email: 'x@example.com', role: 'admin' }, keyHeaders()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('only the member and viewer roles');
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it('refuses a workspace API key that may only view members', async () => {
    world.keyScopes = ['admin.members.view'];

    const response = await POST(post({ email: 'x@example.com' }, keyHeaders()));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('not scoped for admin.members.manage');
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it('refuses a member whose role cannot manage members', async () => {
    session.userId = 'user-member';
    session.role = 'member';

    const response = await POST(post({ email: 'x@example.com' }));

    expect(response.status).toBe(403);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it.each([
    [{ email: 'not-an-address' }],
    [{ email: 'x@example.com', role: 'owner' }],
    [{ email: 'x@example.com', note: 'hi' }],
  ])('rejects the malformed invitation %j', async (body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(400);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it('maps a conflict from the invitation service to 409', async () => {
    mocks.createInvitation.mockRejectedValueOnce(
      createError.conflict('That address already belongs to a member of this workspace'),
    );

    const response = await POST(post({ email: 'user-member@example.com' }));

    expect(response.status).toBe(409);
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    expect(invitedEvent()).toBeUndefined();
  });

  it('refuses a session request without a CSRF token before inviting anyone', async () => {
    mocks.csrf.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(post({ email: 'x@example.com' }));

    expect(response.status).toBe(403);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });
});
