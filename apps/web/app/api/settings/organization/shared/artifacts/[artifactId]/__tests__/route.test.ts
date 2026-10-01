import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
type ScanModule0 = typeof import('@/lib/services/org-sharing-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveOrgMembership: vi.fn(),
  unshareArtifactFromOrganization: vi.fn(),
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
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
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveOrgMembership: mocks.resolveOrgMembership,
}));
vi.mock('@/lib/services/org-shared-artifact-service', () => ({
  getOrgReadableArtifactByToken: vi.fn(),
  isArtifactSharingSchemaUnavailable: vi.fn(),
  listSharedArtifacts: vi.fn(),
  resolveArtifactShareTarget: vi.fn(),
  shareArtifactWithOrganization: vi.fn(),
  unshareArtifactFromOrganization: mocks.unshareArtifactFromOrganization,
}));

import { DELETE } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const ARTIFACT = '55555555-5555-4555-8555-555555555555';
const db = { query: vi.fn() };

function del(artifactId = ARTIFACT) {
  return DELETE(
    new NextRequest(`http://localhost/api/settings/organization/shared/artifacts/${artifactId}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ artifactId }) },
  );
}

describe('DELETE /api/settings/organization/shared/artifacts/[artifactId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'owner-1', organizationId: ORG });
    mocks.resolveOrgMembership.mockResolvedValue({ organizationId: ORG, role: 'member' });
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await del();

    expect(response.status).toBe(429);
    expect(mocks.unshareArtifactFromOrganization).not.toHaveBeenCalled();
  });

  it('returns the csrf refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await del();

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid artifact id before authenticating', async () => {
    const response = await del('not-a-uuid');

    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await del();

    expect(response.status).toBe(401);
  });

  it('refuses a caller who is not in an organization', async () => {
    mocks.resolveOrgMembership.mockResolvedValue(null);

    const response = await del();

    expect(response.status).toBe(403);
    expect(mocks.unshareArtifactFromOrganization).not.toHaveBeenCalled();
  });

  it('returns 404 and records nothing when the artifact was not shared', async () => {
    mocks.unshareArtifactFromOrganization.mockResolvedValue(false);

    const response = await del();

    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('unshares from the caller organization and records the revocation', async () => {
    mocks.unshareArtifactFromOrganization.mockResolvedValue(true);

    const response = await del();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.resolveOrgMembership).toHaveBeenCalledWith(db, 'owner-1');
    expect(mocks.unshareArtifactFromOrganization).toHaveBeenCalledWith(db, ORG, ARTIFACT);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        organizationId: ORG,
        eventType: 'organization_share_revoked',
        detail: { resourceType: 'artifact', resourceId: ARTIFACT },
      }),
    );
  });
});
