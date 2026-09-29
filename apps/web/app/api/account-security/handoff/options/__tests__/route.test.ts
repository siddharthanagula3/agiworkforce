import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getNeonDb: vi.fn(),
  beginHandoffVerification: vi.fn(),
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
vi.mock('@/lib/server/account-security/handoff', () => ({
  finishHandoffVerification: vi.fn(),
  beginHandoffVerification: mocks.beginHandoffVerification,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const HANDOFF = 'h'.repeat(43);
const neonDb = { query: vi.fn() };

function request(body: unknown): never {
  return new Request('http://localhost/api/account-security/handoff/options', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/account-security/handoff/options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getNeonDb.mockReturnValue(neonDb);
    mocks.beginHandoffVerification.mockResolvedValue({ challenge: 'challenge-1' });
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ handoff: HANDOFF }));

    expect(response.status).toBe(403);
    expect(mocks.beginHandoffVerification).not.toHaveBeenCalled();
  });

  it('honours the handoff rate limit bucket', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await POST(request({ handoff: HANDOFF }));

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-handoff');
  });

  it('rejects a malformed handoff token with 400', async () => {
    const response = await POST(request({ handoff: 'not a token' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'This link is not valid. Start again from the app.' },
    });
    expect(mocks.beginHandoffVerification).not.toHaveBeenCalled();
  });

  it('returns uncached assertion options for the handoff', async () => {
    const response = await POST(request({ handoff: HANDOFF }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({ challenge: 'challenge-1' });
    expect(mocks.beginHandoffVerification).toHaveBeenCalledWith(neonDb, HANDOFF);
  });

  it('maps an expired handoff to 404', async () => {
    mocks.beginHandoffVerification.mockRejectedValue(
      createError.notFound('This link expired. Start again from the app.').asUserSafe(),
    );

    const response = await POST(request({ handoff: HANDOFF }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'This link expired. Start again from the app.' },
    });
  });

  it('maps an account with no keys to 409', async () => {
    mocks.beginHandoffVerification.mockRejectedValue(
      createError.conflict('This account has no passkey or security key to verify with.'),
    );

    const response = await POST(request({ handoff: HANDOFF }));

    expect(response.status).toBe(409);
  });
});
