import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(),
  appReturnOwner: vi.fn(),
  finish: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(),
  getOptionalAuthUser: vi.fn(),
  getSuspendedAccountUser: vi.fn(),
  isAccountUnavailableError: vi.fn(),
  getClerkAuthUser: (...a: unknown[]) => mocks.authUser(...a),
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
  requireCsrfToken: vi.fn(async () => null),
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
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorGrantDecryptionError: class ConnectorGrantDecryptionError extends Error {},
  ConnectorGrantLockTimeoutError: class ConnectorGrantLockTimeoutError extends Error {},
  ConnectorOAuthStoreUnavailableError: class ConnectorOAuthStoreUnavailableError extends Error {},
  PENDING_AUTHORIZATION_TTL_SECONDS: 600,
  __resetConnectorAccountColumnProbeForTests: vi.fn(),
  consumePendingAuthorization: vi.fn(),
  createPendingAuthorization: vi.fn(),
  getConnectorOAuthGrant: vi.fn(),
  getUserConnectorOAuthGrantSummaries: vi.fn(),
  listConnectorAccounts: vi.fn(),
  listPendingConnectorIds: vi.fn(),
  listRevocableConnectorTokens: vi.fn(),
  markAppReturn: vi.fn(),
  revokeConnectorOAuthGrant: vi.fn(),
  updateConnectorOAuthGrantTokens: vi.fn(),
  upsertConnectorOAuthGrant: vi.fn(),
  withLockedConnectorOAuthGrant: vi.fn(),
  appReturnOwner: (...a: unknown[]) => mocks.appReturnOwner(...a),
}));
vi.mock('@/lib/connectors/finish-authorization', () => ({
  finishConnectorAuthorization: (...a: unknown[]) => mocks.finish(...a),
}));

const { POST } = await import('./route');

const STATE = 'a'.repeat(64);

function post(body: unknown): NextRequest {
  return new NextRequest('https://app.example.com/api/connectors/oauth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUser.mockResolvedValue({ userId: 'user-1' });
  mocks.appReturnOwner.mockResolvedValue('user-1');
  mocks.finish.mockResolvedValue({
    returnPath: '/connectors',
    connectorId: 'linear',
    status: 'connected',
  });
});

describe('POST /api/connectors/oauth/complete', () => {
  it('finishes an app sign-in for the signed-in account', async () => {
    const response = await POST(
      post({ state: STATE, code: 'auth-code', iss: 'https://auth.example.com' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ connectorId: 'linear', status: 'connected' });
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        state: STATE,
        code: 'auth-code',
        iss: 'https://auth.example.com',
        providerError: null,
      }),
    );
  });

  it('refuses a state that no app sign-in is waiting on, without finishing it', async () => {
    mocks.appReturnOwner.mockResolvedValue(null);

    const response = await POST(post({ state: STATE, code: 'auth-code' }));

    await expect(response.json()).resolves.toEqual({ connectorId: '', status: 'invalid_state' });
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it('refuses to finish a sign-in another account started', async () => {
    mocks.appReturnOwner.mockResolvedValue('someone-else');

    const response = await POST(post({ state: STATE, code: 'auth-code' }));

    await expect(response.json()).resolves.toEqual({ connectorId: '', status: 'invalid_state' });
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it('passes a provider denial through to the finisher', async () => {
    mocks.finish.mockResolvedValue({
      returnPath: '/connectors',
      connectorId: 'linear',
      status: 'denied',
    });

    const response = await POST(post({ state: STATE, error: 'access_denied' }));

    await expect(response.json()).resolves.toEqual({ connectorId: 'linear', status: 'denied' });
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({ code: null, providerError: 'access_denied' }),
    );
  });

  it('rejects a malformed state', async () => {
    const response = await POST(post({ state: 'not-a-state', code: 'auth-code' }));

    expect(response.status).toBe(400);
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});
