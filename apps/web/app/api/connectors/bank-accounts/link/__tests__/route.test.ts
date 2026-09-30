import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  bankAccountsUnavailableReason: vi.fn(),
  sensitiveDataRegionRefusal: vi.fn(),
  evaluateConnectorPolicyForUser: vi.fn(),
  recordAuditEvent: vi.fn(),
  createBankAccountsLinkToken: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/free-chat-surface-policy', () => ({
  bindSurfaceFromClaims: vi.fn(),
  canUseManagedCloudChatSurface: vi.fn(),
  getCloudChatSurfaceCapability: vi.fn(),
  readSurfaceHint: vi.fn(),
  resolveCloudChatSurface: () => 'web',
}));
vi.mock('@/lib/connectors/bank-accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/bank-accounts')>()),
  bankAccountsToolDefs: vi.fn(),
  connectBankAccounts: vi.fn(),
  executeBankAccountsTool: vi.fn(),
  isBankAccountsTool: vi.fn(),
  readBankAccountOverview: vi.fn(),
  removeBankAccountsItem: vi.fn(),
  bankAccountsUnavailableReason: mocks.bankAccountsUnavailableReason,
  createBankAccountsLinkToken: mocks.createBankAccountsLinkToken,
}));
vi.mock('@/lib/connectors/sensitive-data-connectors', () => ({
  HEALTHEX_CONNECTOR_ID: 'healthex',
  SENSITIVE_DATA_CONNECTORS: vi.fn(),
  SENSITIVE_DATA_CONNECTOR_IDS: vi.fn(),
  isSensitiveDataToolName: vi.fn(),
  isSensitiveDataToolOffered: vi.fn(),
  sensitiveDataConnector: vi.fn(),
  sensitiveDataRegionRefusal: mocks.sensitiveDataRegionRefusal,
}));
vi.mock('@/lib/services/connector-policy-gate', () => ({
  evaluatePluginPolicyForUser: vi.fn(),
  evaluateConnectorPolicyForUser: mocks.evaluateConnectorPolicyForUser,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

function request(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/connectors/bank-accounts/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.db,
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mocks.bankAccountsUnavailableReason.mockReturnValue(null);
  mocks.sensitiveDataRegionRefusal.mockReturnValue(null);
  mocks.evaluateConnectorPolicyForUser.mockResolvedValue({ allowed: true });
  mocks.createBankAccountsLinkToken.mockResolvedValue({
    linkToken: 'link-sandbox-1',
    expiration: '2026-09-28T12:00:00Z',
  });
});

describe('POST /api/connectors/bank-accounts/link', () => {
  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('answers 503 when bank connections are not configured', async () => {
    mocks.bankAccountsUnavailableReason.mockReturnValue('Bank accounts are not available yet.');

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe('Bank accounts are not available yet.');
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('refuses a region where sensitive financial connectors are not offered', async () => {
    mocks.sensitiveDataRegionRefusal.mockReturnValue('Not available in your region.');

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.sensitiveDataRegionRefusal).toHaveBeenCalledWith(
      'bank-accounts',
      expect.anything(),
    );
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('refuses when workspace connector policy blocks bank accounts', async () => {
    mocks.evaluateConnectorPolicyForUser.mockResolvedValue({
      allowed: false,
      reason: 'Your workspace blocks this connector.',
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe('Your workspace blocks this connector.');
    expect(mocks.evaluateConnectorPolicyForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        userId: 'user-1',
        organizationId: 'org-1',
        connectorId: 'bank-accounts',
        surface: 'web',
      }),
    );
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('creates a link token for the caller and audits the start', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      linkToken: 'link-sandbox-1',
      expiration: '2026-09-28T12:00:00Z',
    });
    expect(mocks.createBankAccountsLinkToken).toHaveBeenCalledWith('user-1');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'connector_authorization_started',
        detail: expect.objectContaining({ connectorId: 'bank-accounts' }),
      }),
    );
  });
});
