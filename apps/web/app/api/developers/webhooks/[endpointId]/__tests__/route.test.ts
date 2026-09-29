import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  updateWebhookEndpoint: vi.fn(),
  deleteWebhookEndpoint: vi.fn(),
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
vi.mock('@/lib/services/developer-webhook-service', () => ({
  DEVELOPER_WEBHOOK_DELIVERY_PAGE: 50,
  DEVELOPER_WEBHOOK_ENDPOINT_LIMIT: 10,
  assertDeliverableUrl: vi.fn(),
  attemptDeveloperWebhookDelivery: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  deliverDeveloperWebhookJob: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  listWebhookEndpoints: vi.fn(),
  queueDeveloperWebhookEvent: vi.fn(),
  redeliverWebhook: vi.fn(),
  sendWebhookTestEvent: vi.fn(),
  updateWebhookEndpoint: mocks.updateWebhookEndpoint,
  deleteWebhookEndpoint: mocks.deleteWebhookEndpoint,
}));

import { createError } from '@/lib/errors';
import { DELETE, PATCH } from '../route';

const ENDPOINT = '44444444-4444-4444-8444-444444444444';
const db = { query: vi.fn() };

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/developers/webhooks/${ENDPOINT}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(endpointId = ENDPOINT) {
  return { params: Promise.resolve({ endpointId }) };
}

describe('/api/developers/webhooks/[endpointId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('refuses an update that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await PATCH(request('PATCH', { enabled: false }), context());
    expect(response.status).toBe(403);
    expect(mocks.updateWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('answers 404 for an endpoint id that is not a uuid', async () => {
    const response = await PATCH(request('PATCH', { enabled: false }), context('abc'));
    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated update with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await PATCH(request('PATCH', { enabled: false }), context());
    expect(response.status).toBe(401);
    expect(mocks.updateWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('rejects an empty patch', async () => {
    const response = await PATCH(request('PATCH', {}), context());
    expect(response.status).toBe(400);
    expect(mocks.updateWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('applies only the supplied fields and audits the change', async () => {
    mocks.updateWebhookEndpoint.mockResolvedValue({
      id: ENDPOINT,
      url: 'https://hooks.example.com/b',
      enabled: false,
    });
    const response = await PATCH(request('PATCH', { enabled: false, description: '' }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      endpoint: { id: ENDPOINT, url: 'https://hooks.example.com/b', enabled: false },
    });
    expect(mocks.updateWebhookEndpoint).toHaveBeenCalledWith(db, 'user-1', ENDPOINT, {
      description: null,
      enabled: false,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'developer_webhook_configured',
        detail: expect.objectContaining({
          resourceId: ENDPOINT,
          changedKeys: ['description', 'enabled'],
          enabled: false,
        }),
      }),
    );
  });

  it('refuses an unauthenticated delete with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(401);
    expect(mocks.deleteWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('deletes the caller endpoint and audits it', async () => {
    mocks.deleteWebhookEndpoint.mockResolvedValue(undefined);
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.deleteWebhookEndpoint).toHaveBeenCalledWith(db, 'user-1', ENDPOINT);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'developer_webhook_deleted' }),
    );
  });

  it('passes a not found from the service through as 404', async () => {
    mocks.deleteWebhookEndpoint.mockRejectedValue(createError.notFound('gone'));
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
