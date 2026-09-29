import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  readSubmissionForReview: vi.fn(),
  decideSubmission: vi.fn(),
  recordAuditEvent: vi.fn(),
  recordNotification: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityProvider: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityUser: vi.fn(),
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
  getNeonDb: () => mocks.db,
}));
vi.mock('@/lib/services/notification-service', () => ({
  DEFAULT_FEED_LIMIT: 30,
  MAX_FEED_LIMIT: 100,
  listNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  recordNotification: mocks.recordNotification,
}));
vi.mock('@/lib/services/plugin-submission-service', () => ({
  createSubmission: vi.fn(),
  isMissingPluginSubmissionSchema: vi.fn(),
  listCommunityPlugins: vi.fn(),
  listCommunitySkillCompanions: vi.fn(),
  listCommunitySkillFiles: vi.fn(),
  listInstalledCommunityPlugins: vi.fn(),
  listSubmissionsForReview: vi.fn(),
  listUserSubmissions: vi.fn(),
  readCommunityPluginFile: vi.fn(),
  updateCommunityInstall: vi.fn(),
  withdrawSubmission: vi.fn(),
  readSubmissionForReview: mocks.readSubmissionForReview,
  decideSubmission: mocks.decideSubmission,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const OPERATOR = 'operator_1';
const SUBMISSION_ID = '5b0f1a8e-7c2d-4e1f-9a3b-2c4d5e6f7a8b';
const DECIDED = {
  id: SUBMISSION_ID,
  pluginKey: 'acme.notes',
  name: 'Acme Notes',
  version: '1.2.0',
  submitterId: 'author_7',
  status: 'approved',
  reviewNote: null,
};

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/admin/plugin-submissions/${SUBMISSION_ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(id = SUBMISSION_ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.readSubmissionForReview.mockResolvedValue({ id: SUBMISSION_ID, name: 'Acme Notes' });
  mocks.decideSubmission.mockResolvedValue(DECIDED);
});

describe('GET /api/admin/plugin-submissions/[id]', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(401);
    expect(mocks.readSubmissionForReview).not.toHaveBeenCalled();
  });

  it('answers 404 to a signed-in user who is not a platform operator', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'author_7' });

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(404);
    expect(mocks.readSubmissionForReview).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that is not a uuid', async () => {
    const response = await GET(request('GET'), context('not-a-uuid'));

    expect(response.status).toBe(404);
    expect(mocks.readSubmissionForReview).not.toHaveBeenCalled();
  });

  it('answers 404 when the submission does not exist', async () => {
    mocks.readSubmissionForReview.mockResolvedValue(null);

    const response = await GET(request('GET'), context());

    expect(response.status).toBe(404);
  });

  it('returns the submission to an operator without caching', async () => {
    const response = await GET(request('GET'), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      submission: { id: SUBMISSION_ID, name: 'Acme Notes' },
    });
    expect(mocks.readSubmissionForReview).toHaveBeenCalledWith(mocks.db, SUBMISSION_ID);
  });
});

describe('POST /api/admin/plugin-submissions/[id]', () => {
  it('returns the CSRF refusal before authenticating', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request('POST', { action: 'approve' }), context());

    expect(response.status).toBe(403);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('answers 404 to a non-operator and decides nothing', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_admin_1' });

    const response = await POST(request('POST', { action: 'approve' }), context());

    expect(response.status).toBe(404);
    expect(mocks.decideSubmission).not.toHaveBeenCalled();
    expect(mocks.recordNotification).not.toHaveBeenCalled();
  });

  it('rejects a rejection that carries no note', async () => {
    const response = await POST(request('POST', { action: 'reject' }), context());

    expect(response.status).toBe(400);
    expect(mocks.decideSubmission).not.toHaveBeenCalled();
  });

  it('answers 404 when the submission is gone', async () => {
    mocks.decideSubmission.mockResolvedValue(null);

    const response = await POST(request('POST', { action: 'approve' }), context());

    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('approves as the operator, audits it and tells the submitter', async () => {
    const response = await POST(request('POST', { action: 'approve' }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ submission: DECIDED });
    expect(mocks.decideSubmission).toHaveBeenCalledWith(
      mocks.db,
      SUBMISSION_ID,
      { action: 'approve' },
      OPERATOR,
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR,
        eventType: 'plugin_marketplace_changed',
        severity: 'info',
        detail: expect.objectContaining({ resourceId: SUBMISSION_ID, targetUserId: 'author_7' }),
      }),
    );
    expect(mocks.recordNotification).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        userId: 'author_7',
        severity: 'success',
        title: 'Acme Notes is in the plugin directory',
        dedupeKey: `plugin-submission:${SUBMISSION_ID}:approved`,
      }),
    );
  });
});
