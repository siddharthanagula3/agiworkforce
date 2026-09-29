import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  sendWebhookTestEvent: vi.fn(),
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
vi.mock('@/lib/services/developer-webhook-service', () => ({
  DEVELOPER_WEBHOOK_DELIVERY_PAGE: 50,
  DEVELOPER_WEBHOOK_ENDPOINT_LIMIT: 10,
  assertDeliverableUrl: vi.fn(),
  attemptDeveloperWebhookDelivery: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  deleteWebhookEndpoint: vi.fn(),
  deliverDeveloperWebhookJob: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  listWebhookEndpoints: vi.fn(),
  queueDeveloperWebhookEvent: vi.fn(),
  redeliverWebhook: vi.fn(),
  updateWebhookEndpoint: vi.fn(),
  sendWebhookTestEvent: mocks.sendWebhookTestEvent,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const ENDPOINT = '44444444-4444-4444-8444-444444444444';
const db = { query: vi.fn() };

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/developers/webhooks/${ENDPOINT}/test`, {
    method: 'POST',
  });
}

function context(endpointId = ENDPOINT) {
  return { params: Promise.resolve({ endpointId }) };
}

describe('/api/developers/webhooks/[endpointId]/test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.sendWebhookTestEvent).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before sending anything', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(429);
    expect(mocks.sendWebhookTestEvent).not.toHaveBeenCalled();
  });

  it('answers 404 for an endpoint id that is not a uuid', async () => {
    const response = await POST(request(), context('nope'));
    expect(response.status).toBe(404);
    expect(mocks.sendWebhookTestEvent).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.sendWebhookTestEvent).not.toHaveBeenCalled();
  });

  it('queues a test delivery for the caller endpoint', async () => {
    mocks.sendWebhookTestEvent.mockResolvedValue({ id: 'd1', status: 'pending' });
    const response = await POST(request(), context());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ delivery: { id: 'd1', status: 'pending' } });
    expect(mocks.sendWebhookTestEvent).toHaveBeenCalledWith(db, 'user-1', ENDPOINT);
  });
});
