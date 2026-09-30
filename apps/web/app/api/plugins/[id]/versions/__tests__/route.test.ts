import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  listPublishedPluginVersions: vi.fn(),
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
vi.mock('@/lib/services/plugin-lifecycle', () => ({
  PLUGIN_LIFECYCLE_ACTIONS: vi.fn(),
  PLUGIN_VERSION_STATUSES: vi.fn(),
  PluginLifecycleError: class PluginLifecycleError extends Error {},
  applyPluginUpdate: vi.fn(),
  deprecatePluginVersion: vi.fn(),
  diffPluginVersionRecords: vi.fn(),
  diffPluginVersions: vi.fn(),
  listPluginLifecycleEvents: vi.fn(),
  listPluginUpdateOffers: vi.fn(),
  listPluginVersions: vi.fn(),
  publishPluginVersion: vi.fn(),
  rollbackPlugin: vi.fn(),
  submitPluginVersionForReview: vi.fn(),
  suspendPluginVersion: vi.fn(),
  listPublishedPluginVersions: mocks.listPublishedPluginVersions,
}));

import { GET } from '../route';

const db = { query: vi.fn() };

function call(id: string) {
  return GET(new NextRequest(`http://localhost/api/plugins/${id}/versions`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/plugins/[id]/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call('acme.tools');

    expect(response.status).toBe(401);
    expect(mocks.listPublishedPluginVersions).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call('acme.tools');

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'model-catalog',
      'user:user-1',
    );
  });

  it('returns 404 for a malformed plugin id', async () => {
    const response = await call('Bad Id!');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'PLUGIN_NOT_FOUND', message: 'Plugin not found.' },
    });
    expect(mocks.listPublishedPluginVersions).not.toHaveBeenCalled();
  });

  it('lists the published versions for the caller', async () => {
    const body = { versions: [{ version: '1.2.0', publishedAt: '2026-09-01T00:00:00.000Z' }] };
    mocks.listPublishedPluginVersions.mockResolvedValue(body);

    const response = await call('acme.tools');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(body);
    expect(mocks.listPublishedPluginVersions).toHaveBeenCalledWith(db, 'user-1', 'acme.tools');
  });
});
