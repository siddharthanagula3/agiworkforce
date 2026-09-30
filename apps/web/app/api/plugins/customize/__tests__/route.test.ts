import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  recordAuditEvent: vi.fn(),
  isMissingPluginMarketplaceSchema: vi.fn(),
  customizePlugin: vi.fn(),
  refusePluginInstall: vi.fn(),
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
  findPluginScanForUser: vi.fn(),
  getMarketplaceEntryForUser: vi.fn(),
  getMarketplaceSource: vi.fn(),
  getMarketplaceSourceEntry: vi.fn(),
  hasMarketplaceSourceNamed: vi.fn(),
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
  isMissingPluginMarketplaceSchema: mocks.isMissingPluginMarketplaceSchema,
}));
vi.mock('@/features/plugins/server/directory/customize', () => ({
  customizePlugin: mocks.customizePlugin,
}));
vi.mock('@/features/plugins/server/directory/install-gate', () => ({
  pluginDependencyRefusal: vi.fn(),
  refusePluginDependencyInstall: vi.fn(),
  refusePluginInstall: mocks.refusePluginInstall,
}));

import { POST } from '../route';

const ENTRY = '55555555-5555-4555-8555-555555555555';
const db = { query: vi.fn() };
const scope = { db, userId: 'user-1', organizationId: 'org-1' };

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/plugins/customize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/plugins/customize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scope);
    mocks.refusePluginInstall.mockResolvedValue(null);
    mocks.isMissingPluginMarketplaceSchema.mockReturnValue(false);
  });

  it('returns the csrf refusal before authenticating', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(401);
  });

  it('rejects a body that names no plugin', async () => {
    const response = await post({ pluginId: 'Not Valid' });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_PLUGIN');
    expect(mocks.customizePlugin).not.toHaveBeenCalled();
  });

  it('returns the install gate refusal for a caller who may not author skills', async () => {
    mocks.refusePluginInstall.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(403);
    expect(mocks.refusePluginInstall).toHaveBeenCalledWith(expect.anything(), scope, {
      pluginKeys: [],
      authorsSkills: true,
    });
    expect(mocks.customizePlugin).not.toHaveBeenCalled();
  });

  it('returns 409 when the plugin is not installed', async () => {
    mocks.customizePlugin.mockResolvedValue({ status: 'missing' });

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('PLUGIN_NOT_CUSTOMIZABLE');
  });

  it('returns 422 with the service message when the plugin cannot be customized', async () => {
    mocks.customizePlugin.mockResolvedValue({ status: 'invalid', message: 'Too many skills.' });

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toBe('Too many skills.');
  });

  it('returns the existing copy without auditing', async () => {
    mocks.customizePlugin.mockResolvedValue({ status: 'existing', entryId: ENTRY });

    const response = await post({ entryId: ENTRY });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entryId: ENTRY, created: false });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('creates a customized copy for the caller and records it', async () => {
    mocks.customizePlugin.mockResolvedValue({ status: 'created', entryId: ENTRY, name: 'Acme' });

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ entryId: ENTRY, created: true });
    expect(mocks.customizePlugin).toHaveBeenCalledWith(db, 'user-1', { pluginId: 'acme.tools' });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'plugin_marketplace_changed',
        detail: { resourceId: ENTRY, resourceName: 'Acme', status: 'customized' },
      }),
    );
  });

  it('answers installs disabled when the marketplace schema is missing', async () => {
    const missing = new Error('relation does not exist');
    mocks.customizePlugin.mockRejectedValue(missing);
    mocks.isMissingPluginMarketplaceSchema.mockReturnValue(true);

    const response = await post({ pluginId: 'acme.tools' });

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('PLUGIN_INSTALLS_DISABLED');
    expect(mocks.isMissingPluginMarketplaceSchema).toHaveBeenCalledWith(missing);
  });
});
