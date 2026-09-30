import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  recordAuditEvent: vi.fn(),
  requireWorkspaceConsolePermission: vi.fn(),
  setMemberRoles: vi.fn(),
  invalidateActiveOrganizationCache: vi.fn(),
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
vi.mock('@/lib/server/request-context-cache', () => ({
  REQUEST_CONTEXT_CACHE_TTL_SECONDS: vi.fn(),
  getCachedAccountStatus: vi.fn(),
  getCachedActiveOrganizationId: vi.fn(),
  invalidateAccountStatusCache: vi.fn(),
  setCachedAccountStatus: vi.fn(),
  setCachedActiveOrganizationId: vi.fn(),
  invalidateActiveOrganizationCache: mocks.invalidateActiveOrganizationCache,
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
  setDirectoryGroupManagers: vi.fn(),
  setDirectoryGroupRoles: vi.fn(),
  setWorkspaceGroupMembers: vi.fn(),
  updateCustomRole: vi.fn(),
  setMemberRoles: mocks.setMemberRoles,
}));
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  resolveWorkspaceConsoleAccess: vi.fn(),
  requireWorkspaceConsolePermission: mocks.requireWorkspaceConsolePermission,
}));

import { PUT } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const ROLE = '33333333-3333-4333-8333-333333333333';
const permissions = new Set(['roles.manage']);

function put(body: unknown, userId = 'user_target') {
  return PUT(
    new NextRequest(`http://localhost/api/settings/organization/members/${userId}/roles`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ userId }) },
  );
}

describe('PUT /api/settings/organization/members/[userId]/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.requireWorkspaceConsolePermission.mockResolvedValue({
      userId: 'admin-1',
      organizationId: ORG,
      access: { role: 'admin', permissions },
    });
    mocks.setMemberRoles.mockResolvedValue({ added: [ROLE], removed: [] });
  });

  it('returns the csrf refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(403);
    expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
  });

  it.each(['  ', 'x'.repeat(256)])('rejects a blank or oversized target id', async (userId) => {
    const response = await put({ roleIds: [ROLE] }, userId);

    expect(response.status).toBe(400);
    expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
  });

  it('refuses a caller without roles.manage', async () => {
    mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

    const response = await put({ roleIds: [ROLE] });

    expect(response.status).toBe(403);
    expect(mocks.requireWorkspaceConsolePermission).toHaveBeenCalledWith(
      expect.anything(),
      'roles.manage',
      expect.any(String),
    );
    expect(mocks.setMemberRoles).not.toHaveBeenCalled();
  });

  it('rejects an invalid body', async () => {
    const response = await put({ roleIds: [ROLE], extra: 1 });

    expect(response.status).toBe(400);
    expect(mocks.setMemberRoles).not.toHaveBeenCalled();
  });

  it('assigns the roles, drops the target cached org context and records it', async () => {
    const response = await put({ roleIds: [ROLE] }, 'user_target');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: 'user_target',
      roleIds: [ROLE],
      added: [ROLE],
      removed: [],
    });
    expect(mocks.setMemberRoles).toHaveBeenCalledWith(mocks.neonDb, {
      organizationId: ORG,
      userId: 'user_target',
      roleIds: [ROLE],
      actorUserId: 'admin-1',
      actorPermissions: permissions,
    });
    expect(mocks.invalidateActiveOrganizationCache).toHaveBeenCalledWith('user_target');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: ORG,
        eventType: 'member_role_changed',
        detail: expect.objectContaining({ targetUserId: 'user_target', scopes: [ROLE] }),
      }),
    );
  });

  it('still invalidates the cache but records nothing when roles did not change', async () => {
    mocks.setMemberRoles.mockResolvedValue({ added: [], removed: [] });

    await put({ roleIds: [ROLE] });

    expect(mocks.invalidateActiveOrganizationCache).toHaveBeenCalledWith('user_target');
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('takes the already-decoded segment as is, so an id with % is not decoded twice', async () => {
    const response = await put({ roleIds: [ROLE] }, 'user%target');

    expect(response.status).toBe(200);
    expect(mocks.setMemberRoles).toHaveBeenCalledWith(
      mocks.neonDb,
      expect.objectContaining({ userId: 'user%target' }),
    );
  });
});
