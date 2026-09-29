import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  recordAuditEvent: vi.fn(),
  requireWorkspaceConsolePermission: vi.fn(),
  readWorkspaceGroupMembers: vi.fn(),
  setWorkspaceGroupMembers: vi.fn(),
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
  renameWorkspaceGroup: vi.fn(),
  setDirectoryGroupManagers: vi.fn(),
  setDirectoryGroupRoles: vi.fn(),
  setMemberRoles: vi.fn(),
  updateCustomRole: vi.fn(),
  readWorkspaceGroupMembers: mocks.readWorkspaceGroupMembers,
  setWorkspaceGroupMembers: mocks.setWorkspaceGroupMembers,
}));
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  resolveWorkspaceConsoleAccess: vi.fn(),
  requireWorkspaceConsolePermission: mocks.requireWorkspaceConsolePermission,
}));

import { GET, PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';

function call(method: 'GET' | 'PUT', body?: unknown, groupId = GROUP) {
  const request = new NextRequest(
    `http://localhost/api/settings/organization/groups/${groupId}/members`,
    {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const context = { params: Promise.resolve({ groupId }) };
  return method === 'GET' ? GET(request, context) : PUT(request, context);
}

describe('/api/settings/organization/groups/[groupId]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.requireWorkspaceConsolePermission.mockResolvedValue({
      userId: 'admin-1',
      organizationId: ORG,
      access: { role: 'admin', permissions: new Set(['groups.manage']) },
    });
  });

  describe('GET', () => {
    it('rejects a non-uuid group id', async () => {
      const response = await call('GET', undefined, 'nope');

      expect(response.status).toBe(400);
      expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
    });

    it('refuses a caller without groups.manage', async () => {
      mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

      const response = await call('GET');

      expect(response.status).toBe(403);
      expect(mocks.readWorkspaceGroupMembers).not.toHaveBeenCalled();
    });

    it('lists the group members in the caller workspace', async () => {
      mocks.readWorkspaceGroupMembers.mockResolvedValue(['u-1', 'u-2']);

      const response = await call('GET');

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ groupId: GROUP, userIds: ['u-1', 'u-2'] });
      expect(mocks.readWorkspaceGroupMembers).toHaveBeenCalledWith(mocks.neonDb, ORG, GROUP);
    });
  });

  describe('PUT', () => {
    it('returns the csrf refusal', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('PUT', { userIds: [] });

      expect(response.status).toBe(403);
      expect(mocks.setWorkspaceGroupMembers).not.toHaveBeenCalled();
    });

    it('rejects an invalid body', async () => {
      const response = await call('PUT', { userIds: [42] });

      expect(response.status).toBe(400);
      expect(mocks.setWorkspaceGroupMembers).not.toHaveBeenCalled();
    });

    it('replaces the members and records the change', async () => {
      mocks.setWorkspaceGroupMembers.mockResolvedValue({ added: ['u-3'], removed: ['u-1'] });

      const response = await call('PUT', { userIds: ['u-2', 'u-3'] });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        groupId: GROUP,
        userIds: ['u-2', 'u-3'],
        added: ['u-3'],
        removed: ['u-1'],
      });
      expect(mocks.setWorkspaceGroupMembers).toHaveBeenCalledWith(mocks.neonDb, {
        organizationId: ORG,
        groupId: GROUP,
        userIds: ['u-2', 'u-3'],
        actorUserId: 'admin-1',
      });
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          organizationId: ORG,
          eventType: 'workspace_group_changed',
          detail: expect.objectContaining({ resourceId: GROUP, reason: 'added 1, removed 1' }),
        }),
      );
    });

    it('records nothing when membership did not change', async () => {
      mocks.setWorkspaceGroupMembers.mockResolvedValue({ added: [], removed: [] });

      const response = await call('PUT', { userIds: ['u-2'] });

      expect(response.status).toBe(200);
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    });
  });
});
