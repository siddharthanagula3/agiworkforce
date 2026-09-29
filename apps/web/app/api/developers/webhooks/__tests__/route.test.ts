import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  listWebhookEndpoints: vi.fn(),
  createWebhookEndpoint: vi.fn(),
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
  deleteWebhookEndpoint: vi.fn(),
  deliverDeveloperWebhookJob: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  queueDeveloperWebhookEvent: vi.fn(),
  redeliverWebhook: vi.fn(),
  sendWebhookTestEvent: vi.fn(),
  updateWebhookEndpoint: vi.fn(),
  listWebhookEndpoints: mocks.listWebhookEndpoints,
  createWebhookEndpoint: mocks.createWebhookEndpoint,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const db = { query: vi.fn() };

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/developers/webhooks', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('/api/developers/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('refuses an unauthenticated list with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request('GET'));
    expect(response.status).toBe(401);
    expect(mocks.listWebhookEndpoints).not.toHaveBeenCalled();
  });

  it('lists the caller endpoints', async () => {
    mocks.listWebhookEndpoints.mockResolvedValue([{ id: 'e1' }]);
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ endpoints: [{ id: 'e1' }] });
    expect(mocks.listWebhookEndpoints).toHaveBeenCalledWith(db, 'user-1');
  });

  it('refuses a create that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(
      request('POST', { url: 'https://hooks.example.com/a', eventTypes: ['api_key.created'] }),
    );
    expect(response.status).toBe(403);
    expect(mocks.createWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated create with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(
      request('POST', { url: 'https://hooks.example.com/a', eventTypes: ['api_key.created'] }),
    );
    expect(response.status).toBe(401);
    expect(mocks.createWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('rejects an unknown event type', async () => {
    const response = await POST(
      request('POST', { url: 'https://hooks.example.com/a', eventTypes: ['nope.event'] }),
    );
    expect(response.status).toBe(400);
    expect(mocks.createWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('rejects a duplicated event type', async () => {
    const response = await POST(
      request('POST', {
        url: 'https://hooks.example.com/a',
        eventTypes: ['api_key.created', 'api_key.created'],
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.createWebhookEndpoint).not.toHaveBeenCalled();
  });

  it('creates the endpoint, returns its secret once and audits it', async () => {
    mocks.createWebhookEndpoint.mockResolvedValue({
      endpoint: { id: 'e1', url: 'https://hooks.example.com/a', enabled: true },
      secret: 'whsec_abc',
    });
    const response = await POST(
      request('POST', {
        url: 'https://hooks.example.com/a',
        description: '',
        eventTypes: ['api_key.created'],
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      endpoint: { id: 'e1', url: 'https://hooks.example.com/a', enabled: true },
      secret: 'whsec_abc',
    });
    expect(mocks.createWebhookEndpoint).toHaveBeenCalledWith(db, 'user-1', {
      url: 'https://hooks.example.com/a',
      description: null,
      eventTypes: ['api_key.created'],
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'developer_webhook_configured',
        detail: expect.objectContaining({ resourceId: 'e1', resourceName: 'hooks.example.com' }),
      }),
    );
  });
});
