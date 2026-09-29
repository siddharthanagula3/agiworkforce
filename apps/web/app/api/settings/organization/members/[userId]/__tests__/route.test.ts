import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { OrganizationRole } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const session = vi.hoisted(() => ({ userId: 'user-admin', role: 'admin' as OrganizationRole }));
const state = vi.hoisted(() => ({ db: null as unknown }));
const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  csrf: vi.fn(async (_request: unknown): Promise<Response | null> => null),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  invalidateActiveOrganization: vi.fn(async (_userId: string) => undefined),
  deprovisionMember: vi.fn(),
  teamAccess: vi.fn(async () => ({ plan: 'enterprise', canManageTeam: true })),
}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => state.db,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/identity')>()),
  getIdentityProvider: () => ({}),
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/request-context-cache')>()),
  getCachedActiveOrganizationId: vi.fn(async () => undefined),
  setCachedActiveOrganizationId: vi.fn(async () => undefined),
  invalidateActiveOrganizationCache: mocks.invalidateActiveOrganization,
}));
vi.mock('@/lib/services/deprovision-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/deprovision-service')>()),
  deprovisionMember: mocks.deprovisionMember,
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/organization-permission-service')>()),
  ...(await import('../../../__tests__/workspace-admin-api-world')).permissionServiceMock(session),
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
  member,
  type WorkspaceAdminWorld,
} from '../../../__tests__/workspace-admin-api-world';
import { DELETE, GET, PATCH } from '../route';

const URL_BASE = 'https://app.test/api/settings/organization/members';

let world: WorkspaceAdminWorld;

function context(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

function request(
  method: string,
  userId: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  return new NextRequest(`${URL_BASE}/${encodeURIComponent(userId)}`, {
    method,
    headers: { 'content-type': 'application/json', ...options.headers },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function roleOf(userId: string): string | undefined {
  return world.members.find((entry) => entry.user_id === userId)?.role;
}

function asSession(userId: string) {
  session.userId = userId;
  session.role = world.members.find((entry) => entry.user_id === userId)!.role;
}

function auditEvents(eventType: string) {
  return mocks.recordAuditEvent.mock.calls
    .map(([event]) => event as { eventType: string; outcome?: string })
    .filter((event) => event.eventType === eventType && event.outcome !== 'denied');
}

beforeEach(() => {
  vi.clearAllMocks();
  clearIpAllowListCacheForTests();
  world = defaultWorld();
  state.db = createWorkspaceAdminDb(world);
  asSession('user-admin');
  mocks.getUserScopedDb.mockImplementation(async () => ({
    db: state.db,
    userId: session.userId,
    organizationId: ORG,
  }));
  mocks.csrf.mockResolvedValue(null);
  mocks.teamAccess.mockResolvedValue({ plan: 'enterprise', canManageTeam: true });
  mocks.deprovisionMember.mockResolvedValue({
    userId: 'user-member',
    organizationId: ORG,
    sessionsRevoked: 2,
    sessionsFailed: 0,
    deviceTokensRevoked: 1,
    apiKeysRevoked: 1,
    sharedConnectorsUnshared: 0,
    errors: [],
  });
});

describe('GET /api/settings/organization/members/[userId]', () => {
  it('reads one member for an administrator', async () => {
    const response = await GET(request('GET', 'user-member'), context('user-member'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      userId: 'user-member',
      email: 'user-member@example.com',
      role: 'member',
      status: 'active',
    });
  });

  it('answers 404 for someone who is not in this workspace', async () => {
    const response = await GET(request('GET', 'user-stranger'), context('user-stranger'));

    expect(response.status).toBe(404);
  });

  it('rejects a blank member id', async () => {
    const response = await GET(request('GET', ' '), context(' '));

    expect(response.status).toBe(400);
  });

  it('serves a workspace API key whose manage scope implies view', async () => {
    const response = await GET(
      request('GET', 'user-viewer', { headers: keyHeaders() }),
      context('user-viewer'),
    );

    expect(response.status).toBe(200);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await GET(request('GET', 'user-member'), context('user-member'));

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/settings/organization/members/[userId]', () => {
  it('changes a member role for an administrator and records who did it', async () => {
    const response = await PATCH(
      request('PATCH', 'user-member', { body: { role: 'viewer' } }),
      context('user-member'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ userId: 'user-member', role: 'viewer' });
    expect(roleOf('user-member')).toBe('viewer');
    expect(mocks.invalidateActiveOrganization).toHaveBeenCalledWith('user-member');
    const [event] = auditEvents('member_role_changed') as Array<Record<string, unknown>>;
    expect(event).toMatchObject({
      userId: 'user-admin',
      organizationId: ORG,
      surface: undefined,
      detail: expect.objectContaining({
        targetUserId: 'user-member',
        previousRole: 'member',
        role: 'viewer',
        source: undefined,
      }),
    });
  });

  it('lets a workspace API key move a member to viewer and marks the event as the key', async () => {
    const response = await PATCH(
      request('PATCH', 'user-member', { body: { role: 'viewer' }, headers: keyHeaders() }),
      context('user-member'),
    );

    expect(response.status).toBe(200);
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(roleOf('user-member')).toBe('viewer');
    const [event] = auditEvents('member_role_changed') as Array<Record<string, unknown>>;
    expect(event).toMatchObject({
      userId: KEY_ACTOR,
      surface: 'api',
      detail: expect.objectContaining({ source: `admin_api_key:${KEY_ID}`, role: 'viewer' }),
    });
  });

  it('never lets a workspace API key grant the admin role', async () => {
    const response = await PATCH(
      request('PATCH', 'user-member', { body: { role: 'admin' }, headers: keyHeaders() }),
      context('user-member'),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('only the member and viewer roles');
    expect(roleOf('user-member')).toBe('member');
  });

  it('never lets a workspace API key change an admin', async () => {
    const response = await PATCH(
      request('PATCH', 'user-admin', { body: { role: 'viewer' }, headers: keyHeaders() }),
      context('user-admin'),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('only active members and viewers');
    expect(roleOf('user-admin')).toBe('admin');
  });

  it('never lets a workspace API key change a member whose grants reach admin permissions', async () => {
    world.members.push(
      member('user-delegate', 'member', { permissions: ['content.read', 'members.manage'] }),
    );

    const response = await PATCH(
      request('PATCH', 'user-delegate', { body: { role: 'viewer' }, headers: keyHeaders() }),
      context('user-delegate'),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('whose roles grant no admin permissions');
    expect(roleOf('user-delegate')).toBe('member');
  });

  it('refuses a workspace API key that may only view members', async () => {
    world.keyScopes = ['admin.members.view'];

    const response = await PATCH(
      request('PATCH', 'user-member', { body: { role: 'viewer' }, headers: keyHeaders() }),
      context('user-member'),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('not scoped for admin.members.manage');
  });

  it('keeps the last owner: the only owner cannot demote themselves', async () => {
    asSession('user-owner');

    const response = await PATCH(
      request('PATCH', 'user-owner', { body: { role: 'admin' } }),
      context('user-owner'),
    );

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('last owner');
    expect(roleOf('user-owner')).toBe('owner');
  });

  it('refuses an admin who tries to demote the owner', async () => {
    const response = await PATCH(
      request('PATCH', 'user-owner', { body: { role: 'member' } }),
      context('user-owner'),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('Only a workspace owner');
    expect(roleOf('user-owner')).toBe('owner');
  });

  it('sends ownership changes to the transfer route instead of granting a second owner', async () => {
    asSession('user-owner');

    const response = await PATCH(
      request('PATCH', 'user-admin', { body: { role: 'owner' } }),
      context('user-admin'),
    );

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('transfer-ownership');
    expect(roleOf('user-admin')).toBe('admin');
  });

  it.each([[{ role: 'superuser' }], [{ role: 'viewer', extra: true }], [{}]])(
    'rejects the malformed body %j',
    async (body) => {
      const response = await PATCH(
        request('PATCH', 'user-member', { body }),
        context('user-member'),
      );

      expect(response.status).toBe(400);
      expect(roleOf('user-member')).toBe('member');
    },
  );

  it('answers 404 for someone who is not in this workspace', async () => {
    const response = await PATCH(
      request('PATCH', 'user-stranger', { body: { role: 'viewer' } }),
      context('user-stranger'),
    );

    expect(response.status).toBe(404);
  });

  it('refuses a session request without a CSRF token before changing anything', async () => {
    mocks.csrf.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await PATCH(
      request('PATCH', 'user-member', { body: { role: 'viewer' } }),
      context('user-member'),
    );

    expect(response.status).toBe(403);
    expect(roleOf('user-member')).toBe('member');
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/settings/organization/members/[userId]', () => {
  it('removes a member, revokes their credentials and records the removal', async () => {
    const response = await DELETE(request('DELETE', 'user-member'), context('user-member'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 'user-member',
      removed: true,
      previousRole: 'member',
      revoked: { sessions: 2, deviceTokens: 1, apiKeys: 1 },
      warnings: [],
    });
    expect(roleOf('user-member')).toBeUndefined();
    expect(mocks.deprovisionMember).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      userId: 'user-member',
      organizationId: ORG,
    });
    expect(mocks.invalidateActiveOrganization).toHaveBeenCalledWith('user-member');
    const [event] = auditEvents('member_removed') as Array<Record<string, unknown>>;
    expect(event).toMatchObject({
      userId: 'user-admin',
      outcome: 'success',
      severity: 'warning',
      detail: expect.objectContaining({ targetUserId: 'user-member', previousRole: 'member' }),
    });
  });

  it('reports what deprovisioning could not reach and records the removal as failed', async () => {
    mocks.deprovisionMember.mockResolvedValueOnce({
      userId: 'user-member',
      organizationId: ORG,
      sessionsRevoked: 0,
      sessionsFailed: 1,
      deviceTokensRevoked: 0,
      apiKeysRevoked: 0,
      sharedConnectorsUnshared: 0,
      errors: ['identity provider unreachable'],
    });

    const response = await DELETE(request('DELETE', 'user-member'), context('user-member'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      warnings: ['identity provider unreachable'],
    });
    const [event] = auditEvents('member_removed') as Array<Record<string, unknown>>;
    expect(event).toMatchObject({
      outcome: 'failure',
      severity: 'critical',
      detail: expect.objectContaining({ reason: 'identity provider unreachable' }),
    });
  });

  it('refuses to remove the caller themselves', async () => {
    const response = await DELETE(request('DELETE', 'user-admin'), context('user-admin'));

    expect(response.status).toBe(400);
    expect(roleOf('user-admin')).toBe('admin');
    expect(mocks.deprovisionMember).not.toHaveBeenCalled();
  });

  it('refuses an admin who tries to remove the owner', async () => {
    const response = await DELETE(request('DELETE', 'user-owner'), context('user-owner'));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('Only a workspace owner');
    expect(roleOf('user-owner')).toBe('owner');
  });

  it('lets a workspace API key remove a viewer and marks the event as the key', async () => {
    const response = await DELETE(
      request('DELETE', 'user-viewer', { headers: keyHeaders() }),
      context('user-viewer'),
    );

    expect(response.status).toBe(200);
    expect(roleOf('user-viewer')).toBeUndefined();
    const [event] = auditEvents('member_removed') as Array<Record<string, unknown>>;
    expect(event).toMatchObject({
      userId: KEY_ACTOR,
      surface: 'api',
      detail: expect.objectContaining({ source: `admin_api_key:${KEY_ID}` }),
    });
  });

  it('never lets a workspace API key remove an admin', async () => {
    const response = await DELETE(
      request('DELETE', 'user-admin', { headers: keyHeaders() }),
      context('user-admin'),
    );

    expect(response.status).toBe(403);
    expect(roleOf('user-admin')).toBe('admin');
    expect(mocks.deprovisionMember).not.toHaveBeenCalled();
  });

  it('answers 404 for someone who is not in this workspace', async () => {
    const response = await DELETE(request('DELETE', 'user-stranger'), context('user-stranger'));

    expect(response.status).toBe(404);
    expect(mocks.deprovisionMember).not.toHaveBeenCalled();
  });
});
