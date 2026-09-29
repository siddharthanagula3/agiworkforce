import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  unlinkSlackAccount: vi.fn(),
  db: { query: vi.fn() },
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
vi.mock('@/lib/slack/slack-links', () => ({
  SlackLinkConflictError: class SlackLinkConflictError extends Error {},
  consumeSlackLinkRequest: vi.fn(),
  isSlackLinkToken: vi.fn(),
  issueSlackLinkRequest: vi.fn(),
  linkSlackAccount: vi.fn(),
  listSlackAccountLinks: vi.fn(),
  previewSlackLinkRequest: vi.fn(),
  resolveSlackAccountLink: vi.fn(),
  unlinkSlackAccount: mocks.unlinkSlackAccount,
}));

import { createError } from '@/lib/errors';

import { DELETE } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const LINK = '33333333-3333-4333-8333-333333333333';

function request(): NextRequest {
  return new NextRequest(`http://localhost/api/slack/links/${LINK}`, { method: 'DELETE' });
}

function context(linkId = LINK) {
  return { params: Promise.resolve({ linkId }) };
}

describe('DELETE /api/slack/links/[linkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.db,
      userId: 'user-1',
      organizationId: ORG,
    });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.unlinkSlackAccount.mockResolvedValue({ teamId: 'T1', slackUserId: 'U1' });
  });

  it('returns 401 without a session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await DELETE(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.unlinkSlackAccount).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal and unlinks nothing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await DELETE(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.unlinkSlackAccount).not.toHaveBeenCalled();
  });

  it('rejects a link id that is not a uuid', async () => {
    const response = await DELETE(request(), context('link-1'));
    expect(response.status).toBe(400);
    expect(mocks.unlinkSlackAccount).not.toHaveBeenCalled();
  });

  it('returns 404 when the link is not the caller', async () => {
    mocks.unlinkSlackAccount.mockResolvedValue(null);
    const response = await DELETE(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('unlinks through the caller scoped db and records it', async () => {
    const response = await DELETE(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: LINK });
    expect(mocks.unlinkSlackAccount).toHaveBeenCalledWith(mocks.db, {
      userId: 'user-1',
      linkId: LINK,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'identity_unlinked',
        organizationId: ORG,
        detail: expect.objectContaining({ resourceId: LINK, subjectRef: 'T1:U1' }),
      }),
    );
  });
});
