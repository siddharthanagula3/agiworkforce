import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class TriggerNotFoundError extends Error {}
  class TriggerValidationError extends Error {}
  class TriggerLimitError extends Error {}
  return {
    TriggerNotFoundError,
    TriggerValidationError,
    TriggerLimitError,
    withRateLimit: vi.fn(),
    requireCsrfToken: vi.fn(),
    getUserScopedDb: vi.fn(),
    getTrigger: vi.fn(),
    registerGmailWatch: vi.fn(),
    recordAuditEvent: vi.fn(),
    neonDb: { query: vi.fn() },
  };
});

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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.neonDb,
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
vi.mock('@/lib/triggers/gmail-watch', () => ({
  GMAIL_PUBSUB_TOPIC_ENV: 'GMAIL_PUBSUB_TOPIC',
  readGmailNotice: vi.fn(),
  releaseGmailWatch: vi.fn(),
  renewGmailWatches: vi.fn(),
  startGmailWatch: vi.fn(),
  registerGmailWatch: mocks.registerGmailWatch,
}));
vi.mock('@/lib/triggers/trigger-service', () => ({
  createTrigger: vi.fn(),
  deleteTrigger: vi.fn(),
  listTriggerDeliveries: vi.fn(),
  listTriggers: vi.fn(),
  mapTrigger: vi.fn(),
  triggerListensTo: vi.fn(),
  updateTrigger: vi.fn(),
  validateTriggerInput: vi.fn(),
  TriggerNotFoundError: mocks.TriggerNotFoundError,
  TriggerValidationError: mocks.TriggerValidationError,
  TriggerLimitError: mocks.TriggerLimitError,
  getTrigger: mocks.getTrigger,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const TRIGGER_ID = '66666666-6666-4666-8666-666666666666';
const db = { query: vi.fn() };
const GMAIL_TRIGGER = { id: TRIGGER_ID, name: 'Inbox', source: 'gmail', isEnabled: true };

function request(triggerId = TRIGGER_ID): [NextRequest, never] {
  return [
    new NextRequest(`http://localhost/api/triggers/${triggerId}/watch`, { method: 'POST' }),
    { params: Promise.resolve({ triggerId }) } as never,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user_1', organizationId: 'org_1' });
  mocks.getTrigger.mockResolvedValue(GMAIL_TRIGGER);
  mocks.registerGmailWatch.mockResolvedValue({ ...GMAIL_TRIGGER, watchExpiresAt: 'later' });
});

describe('POST /api/triggers/[triggerId]/watch', () => {
  it('answers 401 when there is no session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(...request());

    expect(response.status).toBe(401);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('stops at the CSRF check bound to the user', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(...request());

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user_1');
    expect(mocks.getTrigger).not.toHaveBeenCalled();
  });

  it('rejects a trigger id that is not a uuid', async () => {
    const response = await POST(...request('nope'));

    expect(response.status).toBe(400);
    expect(mocks.getTrigger).not.toHaveBeenCalled();
  });

  it('answers 404 for a trigger the caller does not own', async () => {
    mocks.getTrigger.mockRejectedValue(new mocks.TriggerNotFoundError());

    const response = await POST(...request());

    expect(response.status).toBe(404);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('refuses a trigger that is not Gmail', async () => {
    mocks.getTrigger.mockResolvedValue({ ...GMAIL_TRIGGER, source: 'webhook' });

    const response = await POST(...request());

    expect(response.status).toBe(400);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('refuses a disabled trigger', async () => {
    mocks.getTrigger.mockResolvedValue({ ...GMAIL_TRIGGER, isEnabled: false });

    const response = await POST(...request());

    expect(response.status).toBe(400);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('restarts the watch for the owner and audits it', async () => {
    const response = await POST(...request());

    expect(response.status).toBe(200);
    expect(mocks.getTrigger).toHaveBeenCalledWith(db, 'user_1', TRIGGER_ID);
    expect(mocks.registerGmailWatch).toHaveBeenCalledWith(mocks.neonDb, GMAIL_TRIGGER, {
      restart: true,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        organizationId: 'org_1',
        eventType: 'event_trigger_updated',
        detail: expect.objectContaining({ resourceId: TRIGGER_ID, changedKeys: ['watch'] }),
      }),
    );
    expect(await response.json()).toEqual({
      trigger: { ...GMAIL_TRIGGER, watchExpiresAt: 'later' },
    });
  });
});
