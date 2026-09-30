import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  recordAuditEvent: vi.fn(),
  requireWorkspaceConsolePermission: vi.fn(),
  setDirectoryGroupManagers: vi.fn(),
  neonDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.neonDb,
}));
vi.mock('@/lib/services/organization-role-service', () => ({
  MAX_WORKSPACE_GROUP_NAME_CHARS: 255,
  assertPermissionsWithinActor: vi.fn(),
  createCustomRole: vi.fn(),
  createWorkspaceGroup: vi.fn(),
  deleteCustomRole: vi.fn(),
  deleteWorkspaceGroup: vi.fn(),
  isDirectoryGroupManager: vi.fn(),
  listDirectoryGroupsWithRoles: vi.fn(),
  listMemberRoleGrants: vi.fn(),
  listOrganizationRoles: vi.fn(),
  readWorkspaceGroupMembers: vi.fn(),
  renameWorkspaceGroup: vi.fn(),
  setDirectoryGroupRoles: vi.fn(),
  setMemberRoles: vi.fn(),
  setWorkspaceGroupMembers: vi.fn(),
  updateCustomRole: vi.fn(),
  setDirectoryGroupManagers: mocks.setDirectoryGroupManagers,
}));
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  resolveWorkspaceConsoleAccess: vi.fn(),
  requireWorkspaceConsolePermission: mocks.requireWorkspaceConsolePermission,
}));

import { PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';

function put(body: unknown, groupId = GROUP) {
  return PUT(
    new NextRequest(`http://localhost/api/settings/organization/groups/${groupId}/managers`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ groupId }) },
  );
}

describe('PUT /api/settings/organization/groups/[groupId]/managers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.requireWorkspaceConsolePermission.mockResolvedValue({
      userId: 'owner-1',
      organizationId: ORG,
      access: { role: 'owner', permissions: new Set(['groups.manage']) },
    });
  });

  it('returns the csrf refusal before anything else', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await put({ userIds: [] });

    expect(response.status).toBe(403);
    expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid group id', async () => {
    const response = await put({ userIds: [] }, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
  });

  it('refuses a caller without groups.manage', async () => {
    mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

    const response = await put({ userIds: ['u-2'] });

    expect(response.status).toBe(403);
    expect(mocks.requireWorkspaceConsolePermission).toHaveBeenCalledWith(
      expect.anything(),
      'groups.manage',
      expect.any(String),
    );
    expect(mocks.setDirectoryGroupManagers).not.toHaveBeenCalled();
  });

  it.each([
    { userIds: 'u-2' },
    { userIds: [''] },
    { userIds: Array.from({ length: 51 }, (_, i) => `u-${i}`) },
    { userIds: [], extra: true },
  ])('rejects an invalid body %#', async (body) => {
    const response = await put(body);

    expect(response.status).toBe(400);
    expect(mocks.setDirectoryGroupManagers).not.toHaveBeenCalled();
  });

  it('sets the managers in the caller workspace and records it', async () => {
    mocks.setDirectoryGroupManagers.mockResolvedValue(['u-2', 'u-3']);

    const response = await put({ userIds: ['u-2', 'u-3'] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ groupId: GROUP, managerUserIds: ['u-2', 'u-3'] });
    expect(mocks.setDirectoryGroupManagers).toHaveBeenCalledWith(mocks.neonDb, {
      organizationId: ORG,
      groupId: GROUP,
      userIds: ['u-2', 'u-3'],
      actorUserId: 'owner-1',
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        organizationId: ORG,
        eventType: 'scim_group_role_mapping_changed',
        detail: expect.objectContaining({ resourceId: GROUP, count: 2, role: 'owner' }),
      }),
    );
  });
});
