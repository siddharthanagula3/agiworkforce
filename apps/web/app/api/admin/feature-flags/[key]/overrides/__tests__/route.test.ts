import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  setFlagOverride: vi.fn(),
  removeFlagOverride: vi.fn(),
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
vi.mock('@/lib/feature-flags/flag-admin-service', () => ({
  archiveFlag: vi.fn(),
  cleanUpStaleFlags: vi.fn(),
  clearFeatureVersionDisable: vi.fn(),
  createFlag: vi.fn(),
  disableFeatureForVersions: vi.fn(),
  engageKillSwitch: vi.fn(),
  toggleFlagKillSwitch: vi.fn(),
  updateFlag: vi.fn(),
  setFlagOverride: mocks.setFlagOverride,
  removeFlagOverride: mocks.removeFlagOverride,
}));

import { createError } from '@/lib/errors';
import { DELETE, PUT } from '../route';

const OPERATOR = 'operator_1';

function request(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/feature-flags/chat.canvas/overrides', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context(key = 'chat.canvas') {
  return { params: Promise.resolve({ key }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.setFlagOverride.mockResolvedValue(undefined);
  mocks.removeFlagOverride.mockResolvedValue(undefined);
});

describe('PUT /api/admin/feature-flags/[key]/overrides', () => {
  const override = { subject: 'user', subjectId: 'user_42', variant: 'on' };

  it('rejects a signed-out caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await PUT(request('PUT', override), context());

    expect(response.status).toBe(401);
    expect(mocks.setFlagOverride).not.toHaveBeenCalled();
  });

  it('answers 404 to a signed-in user who is not a platform operator', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_owner_1' });

    const response = await PUT(request('PUT', override), context());

    expect(response.status).toBe(404);
    expect(mocks.setFlagOverride).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal before authenticating', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await PUT(request('PUT', override), context());

    expect(response.status).toBe(403);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed flag key', async () => {
    const response = await PUT(request('PUT', override), context('Not A Key'));

    expect(response.status).toBe(400);
    expect(mocks.setFlagOverride).not.toHaveBeenCalled();
  });

  it('rejects a workspace override that does not name a workspace id', async () => {
    const response = await PUT(
      request('PUT', { subject: 'workspace', subjectId: 'acme', variant: 'on' }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.setFlagOverride).not.toHaveBeenCalled();
  });

  it('writes the override as the operator', async () => {
    const response = await PUT(request('PUT', override), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.setFlagOverride).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OPERATOR }),
      'chat.canvas',
      { ...override, expiresAt: null },
    );
  });
});

describe('DELETE /api/admin/feature-flags/[key]/overrides', () => {
  it('answers 404 to a non-operator and removes nothing', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_admin_1' });

    const response = await DELETE(
      request('DELETE', { subject: 'user', subjectId: 'user_42' }),
      context(),
    );

    expect(response.status).toBe(404);
    expect(mocks.removeFlagOverride).not.toHaveBeenCalled();
  });

  it('rejects a body with unknown fields', async () => {
    const response = await DELETE(
      request('DELETE', { subject: 'user', subjectId: 'user_42', variant: 'on' }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.removeFlagOverride).not.toHaveBeenCalled();
  });

  it('removes the override for the named subject', async () => {
    const response = await DELETE(
      request('DELETE', { subject: 'user', subjectId: 'user_42' }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.removeFlagOverride).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OPERATOR }),
      'chat.canvas',
      'user',
      'user_42',
    );
  });
});
