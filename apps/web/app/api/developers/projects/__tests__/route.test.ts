import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  listDeveloperProjects: vi.fn(),
  createDeveloperProject: vi.fn(),
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
  ...(await importOriginal<typeof import('@/lib/services/developer-project-service')>()),
  listDeveloperProjects: mocks.listDeveloperProjects,
  createDeveloperProject: mocks.createDeveloperProject,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const db = { query: vi.fn() };

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/developers/projects', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('/api/developers/projects', () => {
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
    expect(mocks.listDeveloperProjects).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before touching the database', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request('GET'));
    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('lists the caller projects through the scoped db', async () => {
    mocks.listDeveloperProjects.mockResolvedValue([{ id: 'p1', name: 'Alpha' }]);
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ projects: [{ id: 'p1', name: 'Alpha' }] });
    expect(mocks.listDeveloperProjects).toHaveBeenCalledWith(db, 'user-1');
  });

  it('refuses a create that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request('POST', { name: 'Alpha' }));
    expect(response.status).toBe(403);
    expect(mocks.createDeveloperProject).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated create with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request('POST', { name: 'Alpha' }));
    expect(response.status).toBe(401);
    expect(mocks.createDeveloperProject).not.toHaveBeenCalled();
  });

  it('rejects a body without a name', async () => {
    const response = await POST(request('POST', { monthlyCreditLimit: 5 }));
    expect(response.status).toBe(400);
    expect(mocks.createDeveloperProject).not.toHaveBeenCalled();
  });

  it('rejects a fractional credit limit', async () => {
    const response = await POST(request('POST', { name: 'Alpha', monthlyCreditLimit: 1.5 }));
    expect(response.status).toBe(400);
    expect(mocks.createDeveloperProject).not.toHaveBeenCalled();
  });

  it('creates the project for the caller and audits it', async () => {
    mocks.createDeveloperProject.mockResolvedValue({ id: 'p9', name: 'Alpha' });
    const response = await POST(request('POST', { name: '  Alpha  ' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ project: { id: 'p9', name: 'Alpha' } });
    expect(mocks.createDeveloperProject).toHaveBeenCalledWith(db, 'user-1', {
      name: 'Alpha',
      monthlyCreditLimit: null,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'developer_project_created',
        detail: expect.objectContaining({ resourceId: 'p9', resourceName: 'Alpha' }),
      }),
    );
  });
});
