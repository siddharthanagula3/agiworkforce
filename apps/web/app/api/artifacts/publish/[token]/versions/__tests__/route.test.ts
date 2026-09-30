import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  listPublishedArtifactVersions: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/published-artifact-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/published-artifact-service')>()),
  listPublishedArtifactVersions: mocks.listPublishedArtifactVersions,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const TOKEN = 'Abcdefghijklmnopqrstuv_1';
const VERSIONS = [
  { version: 2, publishedAt: '2026-09-20T00:00:00.000Z' },
  { version: 1, publishedAt: '2026-09-10T00:00:00.000Z' },
];

function call(token = TOKEN) {
  return GET(new NextRequest(`http://localhost/api/artifacts/publish/${token}/versions`), {
    params: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'user-1', organizationId: null });
  mocks.listPublishedArtifactVersions.mockResolvedValue(VERSIONS);
});

describe('GET /api/artifacts/publish/[token]/versions', () => {
  it('answers 404 for a malformed token without touching auth or the database', async () => {
    const response = await call('short');

    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.listPublishedArtifactVersions).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call();

    expect(response.status).toBe(401);
    expect(mocks.listPublishedArtifactVersions).not.toHaveBeenCalled();
  });

  it('returns the rate limiter answer', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call();

    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('answers 404 when the caller does not own the artifact', async () => {
    mocks.listPublishedArtifactVersions.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(404);
  });

  it('lists the versions for the caller', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ versions: VERSIONS });
    expect(mocks.listPublishedArtifactVersions).toHaveBeenCalledWith(mocks.db, {
      userId: 'user-1',
      token: TOKEN,
    });
  });
});
