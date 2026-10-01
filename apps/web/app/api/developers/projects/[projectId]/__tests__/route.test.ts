import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/developer-project-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  updateDeveloperProject: vi.fn(),
  archiveDeveloperProject: vi.fn(),
  queueDeveloperWebhookEvent: vi.fn(),
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
vi.mock('@/lib/services/developer-project-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  updateDeveloperProject: mocks.updateDeveloperProject,
  archiveDeveloperProject: mocks.archiveDeveloperProject,
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
  redeliverWebhook: vi.fn(),
  sendWebhookTestEvent: vi.fn(),
  updateWebhookEndpoint: vi.fn(),
  queueDeveloperWebhookEvent: mocks.queueDeveloperWebhookEvent,
}));

import { createError } from '@/lib/errors';
import { DELETE, PATCH } from '../route';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const db = { query: vi.fn() };

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/developers/projects/${PROJECT}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(projectId = PROJECT) {
  return { params: Promise.resolve({ projectId }) };
}

describe('/api/developers/projects/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('refuses an update that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await PATCH(request('PATCH', { name: 'New' }), context());
    expect(response.status).toBe(403);
    expect(mocks.updateDeveloperProject).not.toHaveBeenCalled();
  });

  it('answers 404 for a project id that is not a uuid', async () => {
    const response = await PATCH(request('PATCH', { name: 'New' }), context('not-a-uuid'));
    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated update with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await PATCH(request('PATCH', { name: 'New' }), context());
    expect(response.status).toBe(401);
    expect(mocks.updateDeveloperProject).not.toHaveBeenCalled();
  });

  it('rejects an empty patch', async () => {
    const response = await PATCH(request('PATCH', {}), context());
    expect(response.status).toBe(400);
    expect(mocks.updateDeveloperProject).not.toHaveBeenCalled();
  });

  it('updates the caller project with the validated patch', async () => {
    mocks.updateDeveloperProject.mockResolvedValue({ id: PROJECT, name: 'New' });
    const response = await PATCH(
      request('PATCH', { name: ' New ', monthlyCreditLimit: null }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ project: { id: PROJECT, name: 'New' } });
    expect(mocks.updateDeveloperProject).toHaveBeenCalledWith(db, 'user-1', PROJECT, {
      name: 'New',
      monthlyCreditLimit: null,
    });
  });

  it('refuses an unauthenticated archive with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(401);
    expect(mocks.archiveDeveloperProject).not.toHaveBeenCalled();
  });

  it('archives the project and audits and announces every revoked key', async () => {
    mocks.archiveDeveloperProject.mockResolvedValue({
      project: { id: PROJECT, archivedAt: '2026-09-28T00:00:00.000Z' },
      revokedKeyIds: ['key-1', 'key-2'],
    });
    const response = await DELETE(request('DELETE'), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      project: { id: PROJECT, archivedAt: '2026-09-28T00:00:00.000Z' },
      revokedKeys: 2,
    });
    expect(mocks.archiveDeveloperProject).toHaveBeenCalledWith(db, 'user-1', PROJECT);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'api_key_revoked',
        detail: expect.objectContaining({ resourceId: 'key-2', subjectRef: PROJECT }),
      }),
    );
    expect(mocks.queueDeveloperWebhookEvent).toHaveBeenCalledWith(db, 'user-1', 'api_key.revoked', {
      id: 'key-1',
      project_id: PROJECT,
      reason: 'project_archived',
    });
  });
});
