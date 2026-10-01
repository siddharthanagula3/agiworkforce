import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/published-artifact-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  readPublishedArtifactVersion: vi.fn(),
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
  ...(await importOriginal<ScanModule0>()),
  readPublishedArtifactVersion: mocks.readPublishedArtifactVersion,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const TOKEN = 'Abcdefghijklmnopqrstuv_1';
const DETAIL = { version: 3, title: 'Budget', content: '<p>hi</p>' };

function call(version: string, token = TOKEN) {
  return GET(
    new NextRequest(`http://localhost/api/artifacts/publish/${token}/versions/${version}`),
    { params: Promise.resolve({ token, version }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'user-1', organizationId: null });
  mocks.readPublishedArtifactVersion.mockResolvedValue(DETAIL);
});

describe('GET /api/artifacts/publish/[token]/versions/[version]', () => {
  it.each(['0', '-1', '1.5', 'latest'])('answers 404 for version %s', async (version) => {
    const response = await call(version);

    expect(response.status).toBe(404);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed token', async () => {
    const response = await call('1', 'bad token');

    expect(response.status).toBe(404);
    expect(mocks.readPublishedArtifactVersion).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call('3');

    expect(response.status).toBe(401);
    expect(mocks.readPublishedArtifactVersion).not.toHaveBeenCalled();
  });

  it('answers 404 when the version belongs to someone else', async () => {
    mocks.readPublishedArtifactVersion.mockResolvedValue(null);

    const response = await call('3');

    expect(response.status).toBe(404);
  });

  it('returns the version detail scoped to the caller', async () => {
    const response = await call('3');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DETAIL);
    expect(mocks.readPublishedArtifactVersion).toHaveBeenCalledWith(mocks.db, {
      userId: 'user-1',
      token: TOKEN,
      version: 3,
    });
  });
});
