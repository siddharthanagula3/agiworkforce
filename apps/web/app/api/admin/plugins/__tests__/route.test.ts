import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  withRateLimit: vi.fn(),
  listPluginModerationEntries: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityProvider: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityUser: vi.fn(),
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
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.db,
}));
vi.mock('@/lib/services/plugin-registry-service', () => ({
  PLUGIN_REGISTRY_DEFAULT_LIMIT: 50,
  PLUGIN_REGISTRY_MAX_LIMIT: 100,
  PluginRegistryDataError: class PluginRegistryDataError extends Error {},
  getPluginRegistryEntry: vi.fn(),
  listPluginRegistryEntries: vi.fn(),
  listPluginModerationEntries: mocks.listPluginModerationEntries,
}));

import { PLUGIN_DIRECTORY_MAX_SEARCH_CHARS } from '@/features/plugins/server/directory/constants';
import { createError } from '@/lib/errors';
import { GET } from '../route';

const OPERATOR = 'operator_1';

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/plugins${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.listPluginModerationEntries.mockResolvedValue({
    entries: [{ key: 'acme.notes' }],
    total: 1,
  });
});

describe('GET /api/admin/plugins', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.listPluginModerationEntries).not.toHaveBeenCalled();
  });

  it('answers 404 to a signed-in user who is not a platform operator', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_owner_1' });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.listPluginModerationEntries).not.toHaveBeenCalled();
  });

  it('rejects a search longer than the directory allows', async () => {
    const response = await GET(request(`?q=${'a'.repeat(PLUGIN_DIRECTORY_MAX_SEARCH_CHARS + 1)}`));

    expect(response.status).toBe(400);
    expect(mocks.listPluginModerationEntries).not.toHaveBeenCalled();
  });

  it('lists moderation entries for an operator with the trimmed search', async () => {
    const response = await GET(request('?q=%20notes%20'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ plugins: [{ key: 'acme.notes' }], total: 1 });
    expect(mocks.listPluginModerationEntries).toHaveBeenCalledWith(mocks.db, 'notes');
  });
});
