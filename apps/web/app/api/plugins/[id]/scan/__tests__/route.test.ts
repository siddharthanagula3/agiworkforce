import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  findPluginScanForUser: vi.fn(),
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
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  PLUGIN_SIGNING_PUBLIC_KEYS_ENV: 'PLUGIN_SIGNING_PUBLIC_KEYS',
  PluginMarketplaceFetchError: class PluginMarketplaceFetchError extends Error {},
  PluginMarketplaceValidationError: class PluginMarketplaceValidationError extends Error {},
  PluginPackageRefusedError: class PluginPackageRefusedError extends Error {},
  approveMarketplaceInstallationPermissions: vi.fn(),
  assertMarketplaceEntryInstallable: vi.fn(),
  assertPluginPackageInstallable: vi.fn(),
  buildManifestRawUrl: vi.fn(),
  canonicalRepositoryUrl: vi.fn(),
  declaredPluginCount: vi.fn(),
  deleteMarketplaceSource: vi.fn(),
  fetchMarketplaceManifest: vi.fn(),
  findMarketplaceSourceEntry: vi.fn(),
  getMarketplaceEntryForUser: vi.fn(),
  getMarketplaceSource: vi.fn(),
  getMarketplaceSourceEntry: vi.fn(),
  hasMarketplaceSourceNamed: vi.fn(),
  isMissingPluginMarketplaceSchema: vi.fn(),
  listMarketplaceEntriesForUser: vi.fn(),
  listMarketplaceSources: vi.fn(),
  manifestPluginDependencies: vi.fn(),
  marketplacePermissionReview: vi.fn(),
  parseGithubRepositoryUrl: vi.fn(),
  readPluginPackageScan: vi.fn(),
  refreshMarketplaceSource: vi.fn(),
  registerMarketplaceSource: vi.fn(),
  scanAndRecordPluginPackage: vi.fn(),
  sha256OfText: vi.fn(),
  standardManifestToInternal: vi.fn(),
  trustedPluginPublisherKeys: vi.fn(),
  validateManifestAgainstCatalog: vi.fn(),
  verifyPluginPackage: vi.fn(),
  findPluginScanForUser: mocks.findPluginScanForUser,
}));

import { GET } from '../route';

const db = { query: vi.fn() };

function call(id: string) {
  return GET(new NextRequest(`http://localhost/api/plugins/${id}/scan`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/plugins/[id]/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call('acme.tools');

    expect(response.status).toBe(401);
    expect(mocks.findPluginScanForUser).not.toHaveBeenCalled();
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
    expect(mocks.findPluginScanForUser).not.toHaveBeenCalled();
  });

  it('answers a null scan for a malformed plugin id without a lookup', async () => {
    const response = await call('Bad Id!');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ scan: null });
    expect(mocks.findPluginScanForUser).not.toHaveBeenCalled();
  });

  it('returns the caller scan with a private no-store cache policy', async () => {
    const scan = { verdict: 'clean', scannedAt: '2026-09-01T00:00:00.000Z' };
    mocks.findPluginScanForUser.mockResolvedValue(scan);

    const response = await call('acme.tools');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ scan });
    expect(mocks.findPluginScanForUser).toHaveBeenCalledWith(db, 'user-1', 'acme.tools');
  });
});
