import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  assertAccountActive: vi.fn(),
  ensureHealthSpace: vi.fn(),
  findHealthSpaceId: vi.fn(),
  healthSpaceUnavailableReason: vi.fn(),
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
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/health-space-service', () => ({
  conversationHealthSpaceId: vi.fn(),
  conversationKeepsOutOfTraining: vi.fn(),
  isHealthSpaceConnector: vi.fn(),
  ensureHealthSpace: mocks.ensureHealthSpace,
  findHealthSpaceId: mocks.findHealthSpaceId,
  healthSpaceUnavailableReason: mocks.healthSpaceUnavailableReason,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const PROJECT = '77777777-7777-4777-8777-777777777777';
const db = { query: vi.fn() };

function request(method = 'GET'): NextRequest {
  return new NextRequest('http://localhost:3000/api/health-space', { method });
}

describe('/api/health-space', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.assertAccountActive.mockResolvedValue(undefined);
    mocks.healthSpaceUnavailableReason.mockReturnValue(null);
  });

  it('refuses an unauthenticated read with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.findHealthSpaceId).not.toHaveBeenCalled();
  });

  it('reports the reason when health is unavailable for the caller', async () => {
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
    mocks.healthSpaceUnavailableReason.mockReturnValue('workspace');
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'workspace' });
    expect(mocks.healthSpaceUnavailableReason).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(mocks.findHealthSpaceId).not.toHaveBeenCalled();
  });

  it('returns the caller health project id', async () => {
    mocks.findHealthSpaceId.mockResolvedValue(PROJECT);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ status: 'available', projectId: PROJECT });
    expect(mocks.findHealthSpaceId).toHaveBeenCalledWith(db, 'user-1');
  });

  it('refuses a create that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request('POST'));
    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.ensureHealthSpace).not.toHaveBeenCalled();
  });

  it('refuses a suspended account', async () => {
    mocks.assertAccountActive.mockRejectedValue(createError.forbidden('suspended'));
    const response = await POST(request('POST'));
    expect(response.status).toBe(403);
    expect(mocks.ensureHealthSpace).not.toHaveBeenCalled();
  });

  it('refuses creation outside the United States', async () => {
    mocks.healthSpaceUnavailableReason.mockReturnValue('region');
    const response = await POST(request('POST'));
    expect(response.status).toBe(403);
    expect(mocks.ensureHealthSpace).not.toHaveBeenCalled();
  });

  it('refuses creation inside a workspace', async () => {
    mocks.healthSpaceUnavailableReason.mockReturnValue('workspace');
    const response = await POST(request('POST'));
    expect(response.status).toBe(403);
    expect(mocks.ensureHealthSpace).not.toHaveBeenCalled();
  });

  it('refuses creation when health is not configured', async () => {
    mocks.healthSpaceUnavailableReason.mockReturnValue('not_configured');
    const response = await POST(request('POST'));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Health is not available yet.');
    expect(mocks.ensureHealthSpace).not.toHaveBeenCalled();
  });

  it('creates the caller health space', async () => {
    mocks.ensureHealthSpace.mockResolvedValue(PROJECT);
    const response = await POST(request('POST'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'available', projectId: PROJECT });
    expect(mocks.ensureHealthSpace).toHaveBeenCalledWith(db, 'user-1');
  });
});
