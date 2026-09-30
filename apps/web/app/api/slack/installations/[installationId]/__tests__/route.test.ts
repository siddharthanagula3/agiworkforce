import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  uninstallSlackWorkspace: vi.fn(),
  serviceDb: { query: vi.fn() },
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
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: vi.fn(() => mocks.serviceDb),
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
vi.mock('@/lib/slack/slack-installations', () => ({
  deleteSlackInstallationForTeam: vi.fn(),
  findSlackInstallation: vi.fn(),
  findSlackInstallationById: vi.fn(),
  listSlackWorkspacesInstalledBy: vi.fn(),
  saveSlackInstallation: vi.fn(),
  uninstallSlackWorkspace: mocks.uninstallSlackWorkspace,
}));

import { createError } from '@/lib/errors';

import { DELETE } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const INSTALLATION = '22222222-2222-4222-8222-222222222222';

function request(): NextRequest {
  return new NextRequest(`http://localhost/api/slack/installations/${INSTALLATION}`, {
    method: 'DELETE',
  });
}

function context(installationId = INSTALLATION) {
  return { params: Promise.resolve({ installationId }) };
}

describe('DELETE /api/slack/installations/[installationId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: { query: vi.fn() },
      userId: 'user-1',
      organizationId: ORG,
    });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.uninstallSlackWorkspace.mockResolvedValue({ id: INSTALLATION, teamName: 'Acme' });
  });

  it('returns 401 without a session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await DELETE(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.uninstallSlackWorkspace).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal and removes nothing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await DELETE(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mocks.uninstallSlackWorkspace).not.toHaveBeenCalled();
  });

  it('rejects an installation id that is not a uuid', async () => {
    const response = await DELETE(request(), context('not-a-uuid'));
    expect(response.status).toBe(400);
    expect(mocks.uninstallSlackWorkspace).not.toHaveBeenCalled();
  });

  it('returns 404 when the caller did not install that workspace', async () => {
    mocks.uninstallSlackWorkspace.mockResolvedValue(null);
    const response = await DELETE(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('uninstalls as the caller and records the removal', async () => {
    const response = await DELETE(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: INSTALLATION });
    expect(mocks.uninstallSlackWorkspace).toHaveBeenCalledWith(mocks.serviceDb, {
      installationId: INSTALLATION,
      userId: 'user-1',
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'connector_removed',
        organizationId: ORG,
        detail: expect.objectContaining({
          resourceType: 'slack_installation',
          resourceId: INSTALLATION,
          resourceName: 'Acme',
        }),
      }),
    );
  });
});
