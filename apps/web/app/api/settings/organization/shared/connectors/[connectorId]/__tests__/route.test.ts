import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  permissions: vi.fn(),
  resolveOrgMembership: vi.fn(),
  shareConnector: vi.fn(),
  unshareConnector: vi.fn(),
  evict: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/organization-permission-service', () => ({
  resolveOrganizationPermissions: mocks.permissions,
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/org-sharing-service')>()),
  resolveOrgMembership: mocks.resolveOrgMembership,
}));
vi.mock('@/lib/services/org-shared-connector-service', () => ({
  shareConnector: mocks.shareConnector,
  unshareConnector: mocks.unshareConnector,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  evictOrgSharedConnectorCaches: mocks.evict,
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { createError } from '@/lib/errors';
import { DELETE, PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONNECTOR = '44444444-4444-4444-8444-444444444444';
const DB = { query: vi.fn() };

function request(method: string): never {
  return new Request(`http://localhost/api/settings/organization/shared/connectors/${CONNECTOR}`, {
    method,
  }) as never;
}

function ctx(connectorId = CONNECTOR) {
  return { params: Promise.resolve({ connectorId }) };
}

describe('shared connector route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: 'admin-1' });
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'admin' });
    mocks.permissions.mockResolvedValue(new Set(['sharing.manage']));
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await PUT(request('PUT'), ctx());
    expect(response.status).toBe(401);
    expect(mocks.shareConnector).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal before touching the database', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await PUT(request('PUT'), ctx());
    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const response = await DELETE(request('DELETE'), ctx());
    expect(response.status).toBe(429);
  });

  it('rejects a connector id that is not a uuid', async () => {
    const response = await PUT(request('PUT'), ctx('not-a-uuid'));
    expect(response.status).toBe(400);
    expect(mocks.shareConnector).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not in an organization', async () => {
    mocks.resolveOrgMembership.mockResolvedValue(null);
    const response = await PUT(request('PUT'), ctx());
    expect(response.status).toBe(403);
    expect(mocks.shareConnector).not.toHaveBeenCalled();
  });

  it('returns 403 when the role cannot manage sharing', async () => {
    mocks.permissions.mockResolvedValue(new Set(['content.read']));
    const response = await PUT(request('PUT'), ctx());
    expect(response.status).toBe(403);
    expect(mocks.permissions).toHaveBeenCalledWith(ORG, 'admin-1');
    expect(mocks.shareConnector).not.toHaveBeenCalled();
  });

  it('shares the connector into the caller organization and audits it', async () => {
    const shared = { connectorRowId: CONNECTOR, organizationId: ORG };
    mocks.shareConnector.mockResolvedValue(shared);

    const response = await PUT(request('PUT'), ctx());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sharedConnector: shared });
    expect(mocks.shareConnector).toHaveBeenCalledWith(DB, {
      organizationId: ORG,
      connectorRowId: CONNECTOR,
      actorUserId: 'admin-1',
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: ORG,
        eventType: 'organization_share_granted',
        detail: { resourceType: 'connector', resourceId: CONNECTOR },
      }),
    );
  });

  it('returns 404 when unsharing a connector that is not shared', async () => {
    mocks.unshareConnector.mockResolvedValue(false);
    const response = await DELETE(request('DELETE'), ctx());
    expect(response.status).toBe(404);
    expect(mocks.evict).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('unshares the connector, evicts caches and audits the revoke', async () => {
    mocks.unshareConnector.mockResolvedValue(true);

    const response = await DELETE(request('DELETE'), ctx());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.unshareConnector).toHaveBeenCalledWith(DB, ORG, CONNECTOR);
    expect(mocks.evict).toHaveBeenCalledWith(ORG, CONNECTOR);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: ORG,
        eventType: 'organization_share_revoked',
      }),
    );
  });
});
