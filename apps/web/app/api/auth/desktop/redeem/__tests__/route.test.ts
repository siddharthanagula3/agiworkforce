import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/server/desktop-sign-in');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  redeemDesktopSignInGrant: vi.fn(),
  mintDesktopSignInTicket: vi.fn(),
  recordAuditEvent: vi.fn(),
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
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityProvider: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: vi.fn(),
}));
vi.mock('@/lib/server/desktop-sign-in', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  redeemDesktopSignInGrant: mocks.redeemDesktopSignInGrant,
  mintDesktopSignInTicket: mocks.mintDesktopSignInTicket,
}));

import { POST } from '../route';

const CODE = 'c'.repeat(43);
const VERIFIER = 'v'.repeat(64);

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/desktop/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.redeemDesktopSignInGrant.mockResolvedValue('user-1');
  mocks.mintDesktopSignInTicket.mockResolvedValue('ticket-abc');
});

describe('POST /api/auth/desktop/redeem', () => {
  it('returns the rate limiter answer before reading the body', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(request({ code: CODE, verifier: VERIFIER }));

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'device-code-lookup');
    expect(mocks.redeemDesktopSignInGrant).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(request('not json'));

    expect(response.status).toBe(400);
    expect(mocks.redeemDesktopSignInGrant).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'short', verifier: VERIFIER },
    { code: CODE, verifier: 'short' },
    { code: CODE },
  ])('rejects a malformed code or verifier %#', async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.redeemDesktopSignInGrant).not.toHaveBeenCalled();
  });

  it('answers 404 for an expired or reused grant and mints nothing', async () => {
    mocks.redeemDesktopSignInGrant.mockResolvedValue(null);

    const response = await POST(request({ code: CODE, verifier: VERIFIER }));

    expect(response.status).toBe(404);
    expect(mocks.mintDesktopSignInTicket).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('mints a ticket for the grant owner and audits the sign-in', async () => {
    const response = await POST(request({ code: CODE, verifier: VERIFIER }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ ticket: 'ticket-abc' });
    expect(mocks.redeemDesktopSignInGrant).toHaveBeenCalledWith(CODE, VERIFIER);
    expect(mocks.mintDesktopSignInTicket).toHaveBeenCalledWith('user-1');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'login',
        detail: { resourceType: 'desktop_sign_in' },
      }),
    );
  });
});
