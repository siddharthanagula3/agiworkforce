import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  renewGmailWatches: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  getClientIpForRateLimit: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.db,
}));
vi.mock('@/lib/triggers/gmail-watch', () => ({
  GMAIL_PUBSUB_TOPIC_ENV: 'GMAIL_PUBSUB_TOPIC',
  readGmailNotice: vi.fn(),
  registerGmailWatch: vi.fn(),
  releaseGmailWatch: vi.fn(),
  startGmailWatch: vi.fn(),
  renewGmailWatches: mocks.renewGmailWatches,
}));

import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';
import { GET } from '../route';

const SECRET = 'cron-secret-with-at-least-thirty-two-chars';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/renew-gmail-watches', {
    headers: authorization ? { authorization } : {},
  });
}

describe('/api/cron/renew-gmail-watches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCronAuthThrottleForTests();
    vi.stubEnv('CRON_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses a request without the cron secret', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.renewGmailWatches).not.toHaveBeenCalled();
  });

  it('refuses a request with the wrong cron secret', async () => {
    const response = await GET(request(`Bearer ${SECRET}x`));
    expect(response.status).toBe(401);
    expect(mocks.renewGmailWatches).not.toHaveBeenCalled();
  });

  it('refuses every request when no cron secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(401);
    expect(mocks.renewGmailWatches).not.toHaveBeenCalled();
  });

  it('renews the watches and returns the summary when the secret matches', async () => {
    mocks.renewGmailWatches.mockResolvedValue({ renewed: 4, failed: 1, queued: 0 });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ renewed: 4, failed: 1, queued: 0 });
    expect(mocks.renewGmailWatches).toHaveBeenCalledWith(mocks.db);
  });

  it('answers 500 without leaking the failure', async () => {
    mocks.renewGmailWatches.mockRejectedValue(new Error('google said token abc123 is bad'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
