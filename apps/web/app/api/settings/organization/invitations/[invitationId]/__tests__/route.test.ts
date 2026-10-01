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
  revokeInvitation: vi.fn(),
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
  ...(await import('../../../__tests__/workspace-admin-api-world')).permissionServiceMock(session),
}));
vi.mock('@/lib/services/organization-invitation-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  revokeInvitation: mocks.revokeInvitation,
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
} from '../../../__tests__/workspace-admin-api-world';
import { DELETE } from '../route';

const INVITE_ID = '55555555-5555-4555-8555-555555555555';

let world: WorkspaceAdminWorld;

function revoke(invitationId: string, headers: Record<string, string> = {}) {
  return DELETE(
    new NextRequest(`https://app.test/api/settings/organization/invitations/${invitationId}`, {
      method: 'DELETE',
      headers,
    }),
    { params: Promise.resolve({ invitationId }) },
  );
}

function revokedEvent() {
  return mocks.recordAuditEvent.mock.calls
    .map(([event]) => event as Record<string, unknown>)
    .find((event) => event['eventType'] === 'member_removed');
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
  mocks.revokeInvitation.mockResolvedValue({
    id: INVITE_ID,
    organization_id: ORG,
    email: 'new.person@example.com',
    role: 'member',
    status: 'revoked',
    token_hash: 'stored-token-hash',
    invited_by_user_id: 'user-admin',
    accepted_by_user_id: null,
    expires_at: '2026-10-04T00:00:00.000Z',
    resent_at: null,
    resend_count: 0,
    created_at: '2026-09-27T00:00:00.000Z',
    updated_at: '2026-09-27T01:00:00.000Z',
  });
});

describe('DELETE /api/settings/organization/invitations/[invitationId]', () => {
  it('revokes a pending invitation and records it', async () => {
    const response = await revoke(INVITE_ID);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: INVITE_ID, status: 'revoked' });
    expect(JSON.stringify(body)).not.toContain('stored-token-hash');
    expect(mocks.revokeInvitation).toHaveBeenCalledWith(state.db, ORG, INVITE_ID);
    expect(revokedEvent()).toMatchObject({
      userId: 'user-admin',
      organizationId: ORG,
      surface: undefined,
      detail: expect.objectContaining({
        resourceType: 'organization_invitation',
        resourceId: INVITE_ID,
        reason: 'invitation_revoked',
        source: undefined,
      }),
    });
  });

  it('lets a workspace API key revoke and marks the event as the key', async () => {
    const response = await revoke(INVITE_ID, keyHeaders());

    expect(response.status).toBe(200);
    expect(mocks.csrf).not.toHaveBeenCalled();
    expect(revokedEvent()).toMatchObject({
      userId: KEY_ACTOR,
      surface: 'api',
      detail: expect.objectContaining({ source: `admin_api_key:${KEY_ID}` }),
    });
  });

  it('refuses a workspace API key that may only view members', async () => {
    world.keyScopes = ['admin.members.view'];

    const response = await revoke(INVITE_ID, keyHeaders());

    expect(response.status).toBe(403);
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a UUID before touching the database', async () => {
    const response = await revoke('not-a-uuid');

    expect(response.status).toBe(400);
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it('answers 404 for an invitation outside this workspace', async () => {
    mocks.revokeInvitation.mockRejectedValueOnce(
      createError.notFound('Invitation not found in this organization'),
    );

    const response = await revoke(INVITE_ID);

    expect(response.status).toBe(404);
    expect(revokedEvent()).toBeUndefined();
  });

  it('answers 409 for an invitation that is no longer pending', async () => {
    mocks.revokeInvitation.mockRejectedValueOnce(
      createError.conflict('This invitation is already accepted'),
    );

    const response = await revoke(INVITE_ID);

    expect(response.status).toBe(409);
    expect(revokedEvent()).toBeUndefined();
  });

  it('refuses a member whose role cannot manage members', async () => {
    session.userId = 'user-viewer';
    session.role = 'viewer';

    const response = await revoke(INVITE_ID);

    expect(response.status).toBe(403);
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it('refuses a session request without a CSRF token', async () => {
    mocks.csrf.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await revoke(INVITE_ID);

    expect(response.status).toBe(403);
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it('refuses a caller with neither a session nor a workspace API key', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    expect((await revoke(INVITE_ID)).status).toBe(401);
  });
});
