import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getNeonDb: vi.fn(),
  turnOffFromEmailLink: vi.fn(),
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
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/server/account-security/undo', () => ({
  turnOffFromEmailLink: mocks.turnOffFromEmailLink,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const TOKEN = 'a'.repeat(43);
const neonDb = { query: vi.fn() };

function request(body: unknown): never {
  return new Request('http://localhost/api/account-security/enrollment/undo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/account-security/enrollment/undo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getNeonDb.mockReturnValue(neonDb);
    mocks.turnOffFromEmailLink.mockResolvedValue({ turnedOff: true });
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(403);
    expect(mocks.turnOffFromEmailLink).not.toHaveBeenCalled();
  });

  it('honours the handoff rate limit bucket', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-handoff');
    expect(mocks.turnOffFromEmailLink).not.toHaveBeenCalled();
  });

  it('rejects a malformed token with 400', async () => {
    const response = await POST(request({ token: 'short' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'This link is not valid. Open it again from the email.',
      },
    });
    expect(mocks.turnOffFromEmailLink).not.toHaveBeenCalled();
  });

  it('rejects unknown fields', async () => {
    const response = await POST(request({ token: TOKEN, userId: 'someone-else' }));

    expect(response.status).toBe(400);
    expect(mocks.turnOffFromEmailLink).not.toHaveBeenCalled();
  });

  it('turns off account security with the link token and returns uncached', async () => {
    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ turnedOff: true });
    expect(mocks.turnOffFromEmailLink).toHaveBeenCalledWith(neonDb, TOKEN, expect.anything());
  });

  it('maps a used or expired link to 404 with the service message', async () => {
    mocks.turnOffFromEmailLink.mockRejectedValue(
      createError.notFound('This link expired or was already used.').asUserSafe(),
    );

    const response = await POST(request({ token: TOKEN }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND', message: 'This link expired or was already used.' },
    });
  });
});
