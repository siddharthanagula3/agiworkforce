import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/org-sharing-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  resolveOrgMembershipForOrganization: vi.fn(),
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
  resolveOrgMembershipForOrganization: mocks.resolveOrgMembershipForOrganization,
}));
vi.mock('@/lib/services/org-shared-session-service', () => ({
  updateSharedSessionAudience: vi.fn(),
  SHARED_SESSION_VISIBILITIES: vi.fn(),
  SHARE_IN_OTHER_WORKSPACE_MESSAGE: 'This chat belongs to another workspace.',
  SHARE_TOKEN_REGEX: vi.fn(),
  getOrgReadableSessionByToken: vi.fn(),
  getPublicSharedSessionByToken: vi.fn(),
  isSharedSessionVisibility: vi.fn(),
  listSharedSessions: vi.fn(),
  readSharedSessionScope: vi.fn(),
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
    mocks.unshare.mockReset();
    DB.query.mockReset();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: 'member-1', organizationId: ORG });
    mocks.resolveOrgMembershipForOrganization.mockResolvedValue({
      organizationId: ORG,
      role: 'member',
    });
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
    mocks.resolveOrgMembershipForOrganization.mockResolvedValue(null);
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
    expect(mocks.resolveOrgMembershipForOrganization).toHaveBeenCalledWith(DB, 'member-1', ORG);
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

  it('canonicalizes a mixed-case UUID before deleting and auditing its exact receipt', async () => {
    const mixedCaseId = 'aBcDeF12-ABcd-4eF0-8aBc-Def123456789';
    const canonicalId = 'abcdef12-abcd-4ef0-8abc-def123456789';
    const actual = await vi.importActual<ImportedModule0>(
      '@/lib/services/org-shared-session-service',
    );
    mocks.unshare.mockImplementation(actual.unshareSessionFromOrganization);
    DB.query.mockResolvedValue([{ shared_session_id: canonicalId }]);
    const mixedCaseRequest = new Request(
      `http://localhost/api/settings/organization/shared/conversations/${mixedCaseId}`,
      { method: 'DELETE' },
    ) as never;

    const response = await DELETE(mixedCaseRequest, ctx(mixedCaseId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.unshare).toHaveBeenCalledWith(DB, ORG, canonicalId);
    expect(DB.query).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(
      expect.stringMatching(/delete from public\.organization_shared_sessions/),
      [ORG, canonicalId],
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-1',
        organizationId: ORG,
        eventType: 'organization_share_revoked',
        detail: { resourceType: 'conversation', resourceId: canonicalId },
      }),
    );
  });

  it.each([
    { label: 'zero', rows: [], status: 404 },
    { label: 'mismatched', rows: [{ shared_session_id: 'another-session' }], status: 404 },
    {
      label: 'multiple',
      rows: [{ shared_session_id: SESSION }, { shared_session_id: SESSION }],
      status: 404,
    },
    { label: 'exact', rows: [{ shared_session_id: SESSION }], status: 200 },
  ])('reports the real delete helper outcome for $label receipts', async ({ rows, status }) => {
    const actual = await vi.importActual<ImportedModule0>(
      '@/lib/services/org-shared-session-service',
    );
    mocks.unshare.mockImplementation(actual.unshareSessionFromOrganization);
    DB.query.mockResolvedValue(rows);

    const response = await DELETE(request(), ctx());

    expect(response.status).toBe(status);
    expect(DB.query).toHaveBeenCalledTimes(1);
    expect(DB.query).toHaveBeenCalledWith(
      expect.stringMatching(/delete from public\.organization_shared_sessions/),
      [ORG, SESSION],
    );
    expect(DB.query.mock.calls[0]?.[0]).toMatch(
      /where organization_id = \$1\s+and shared_session_id = \$2\s+returning shared_session_id/,
    );
    expect(DB.query.mock.calls[0]?.[0]).not.toMatch(/update public\.shared_sessions/);
    if (status === 200) {
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'member-1',
          organizationId: ORG,
          eventType: 'organization_share_revoked',
          detail: { resourceType: 'conversation', resourceId: SESSION },
        }),
      );
    } else {
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    }
  });
});

type ImportedModule0 = typeof import('@/lib/services/org-shared-session-service');
