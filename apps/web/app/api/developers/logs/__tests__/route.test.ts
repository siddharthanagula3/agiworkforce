import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

import { DEVELOPER_REQUEST_LOGS_PATH } from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  listDeveloperRequestLogs: vi.fn(),
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
vi.mock('@/lib/services/developer-request-log-service', () => ({
  toDeveloperRequestLog: vi.fn(),
  listDeveloperRequestLogs: mocks.listDeveloperRequestLogs,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const db = { query: vi.fn() };

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000${DEVELOPER_REQUEST_LOGS_PATH}${query}`);
}

describe(DEVELOPER_REQUEST_LOGS_PATH, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.listDeveloperRequestLogs.mockResolvedValue({ logs: [], nextBefore: null });
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.listDeveloperRequestLogs).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before resolving the caller', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('reads the first page for the caller and never caches it', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ logs: [], nextBefore: null });
    expect(mocks.listDeveloperRequestLogs).toHaveBeenCalledWith(db, 'user-1', null);
  });

  it('passes the page cursor through to the next page', async () => {
    const before = '2026-10-19T10:00:00.000Z';
    await GET(request(`?before=${encodeURIComponent(before)}`));
    expect(mocks.listDeveloperRequestLogs).toHaveBeenCalledWith(db, 'user-1', before);
  });

  it('rejects a cursor that is not a timestamp before reaching the database', async () => {
    const response = await GET(request('?before=yesterday'));
    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.listDeveloperRequestLogs).not.toHaveBeenCalled();
  });
});
