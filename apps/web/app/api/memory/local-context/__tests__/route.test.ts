import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveLocalTurnPersonalContext: vi.fn(),
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
vi.mock('@/lib/services/turn-context-service', () => ({
  accountMemoryRequested: vi.fn(),
  resolveFreeOfferingPersonalContext: vi.fn(),
  resolveInteractiveTurnContext: vi.fn(),
  resolveLocalTurnPersonalContext: mocks.resolveLocalTurnPersonalContext,
}));

import { GET } from '../route';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const db = { query: vi.fn() };

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/memory/local-context${query}`);
}

describe('GET /api/memory/local-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
  });

  it('returns the rate limit response untouched', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response('slow down', { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a projectId that is not a UUID before touching the database', async () => {
    const response = await GET(request('?projectId=not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.resolveLocalTurnPersonalContext).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.resolveLocalTurnPersonalContext).not.toHaveBeenCalled();
  });

  it('resolves the caller personal context scoped to user, org and project', async () => {
    const body = { instructions: 'be brief', memories: [] };
    mocks.resolveLocalTurnPersonalContext.mockResolvedValue(body);

    const response = await GET(request(`?projectId=${PROJECT}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(mocks.resolveLocalTurnPersonalContext).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      organizationId: 'org-1',
      projectId: PROJECT,
    });
  });

  it('passes a null projectId when none is given', async () => {
    mocks.resolveLocalTurnPersonalContext.mockResolvedValue({});

    await GET(request());

    expect(mocks.resolveLocalTurnPersonalContext).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ projectId: null }),
    );
  });
});
