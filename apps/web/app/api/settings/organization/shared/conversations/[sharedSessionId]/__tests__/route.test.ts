import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/org-sharing-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  resolveOrgMembership: vi.fn(),
  unshare: vi.fn(),
  recordAuditEvent: vi.fn(),
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
  withRateLimit: vi.fn(async () => null),
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/organization-permission-service', () => ({
  SHARE_INTO_WORKSPACE_DENIED_MESSAGE:
    'Your workspace role is read-only, so you cannot share into this workspace. Ask a workspace admin to change your role.',
  requireMemberPermission: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  requirePermission: vi.fn(),
  resolveActiveOrganizationAccess: vi.fn(),
  resolveOrganizationAccess: vi.fn(),
  resolveOrganizationPermissions: vi.fn(async () => new Set()),
}));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveOrgMembership: mocks.resolveOrgMembership,
}));
vi.mock('@/lib/services/org-shared-session-service', () => ({
  SHARED_SESSION_VISIBILITIES: vi.fn(),
  SHARE_TOKEN_REGEX: vi.fn(),
  getOrgReadableSessionByToken: vi.fn(),
  getPublicSharedSessionByToken: vi.fn(),
  isConversationSharingSchemaUnavailable: vi.fn(),
  isSharedSessionVisibility: vi.fn(),
  listSharedSessions: vi.fn(),
  readSharedSessionSharerName: vi.fn(),
  resolveSessionShareTarget: vi.fn(),
  setSharedSessionVisibility: vi.fn(),
  shareSessionWithOrganization: vi.fn(),
  toSharedSessionVisibility: vi.fn(),
  unshareSessionFromOrganization: mocks.unshare,
}));
vi.mock('@/lib/security-audit', () => ({
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { createError } from '@/lib/errors';
import { DELETE } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const SESSION = '55555555-5555-4555-8555-555555555555';
const DB = { query: vi.fn() };

function request(): never {
  return new Request(`http://localhost/api/settings/organization/shared/conversations/${SESSION}`, {
    method: 'DELETE',
  }) as never;
}

function ctx(sharedSessionId = SESSION) {
  return { params: Promise.resolve({ sharedSessionId }) };
}

describe('DELETE shared conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: 'member-1' });
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'member' });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await DELETE(request(), ctx());
    expect(response.status).toBe(401);
    expect(mocks.unshare).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await DELETE(request(), ctx());
    expect(response.status).toBe(403);
    expect(mocks.unshare).not.toHaveBeenCalled();
  });

  it('rejects a session id that is not a uuid', async () => {
    const response = await DELETE(request(), ctx('abc'));
    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller has no organization', async () => {
    mocks.resolveOrgMembership.mockResolvedValue(null);
    const response = await DELETE(request(), ctx());
    expect(response.status).toBe(403);
    expect(mocks.unshare).not.toHaveBeenCalled();
  });

  it('returns 404 when the conversation is not shared', async () => {
    mocks.unshare.mockResolvedValue(false);
    const response = await DELETE(request(), ctx());
    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('unshares from the caller organization and audits the revoke', async () => {
    mocks.unshare.mockResolvedValue(true);
    const response = await DELETE(request(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.resolveOrgMembership).toHaveBeenCalledWith(DB, 'member-1');
    expect(mocks.unshare).toHaveBeenCalledWith(DB, ORG, SESSION);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        organizationId: ORG,
        eventType: 'organization_share_revoked',
        detail: { resourceType: 'conversation', resourceId: SESSION },
      }),
    );
  });
});
