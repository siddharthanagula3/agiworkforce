import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  ingestConnectorDirectory: vi.fn(),
  budget: { crawlMs: 1, totalMs: 2 },
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
vi.mock('@/lib/connectors/directory/ingest', () => ({
  ingestBudgetForMaxDuration: vi.fn(() => mocks.budget),
  ingestConnectorDirectory: mocks.ingestConnectorDirectory,
}));

import { createError } from '@/lib/errors';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';
import { GET } from '../route';

const SECRET = 'cron-secret-with-at-least-thirty-two-chars';

function request(authorization?: string, search = ''): NextRequest {
  return new NextRequest(`https://example.test/api/cron/refresh-connector-directory${search}`, {
    headers: authorization ? { authorization } : {},
  });
}

describe('/api/cron/refresh-connector-directory', () => {
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
    expect(mocks.ingestConnectorDirectory).not.toHaveBeenCalled();
  });

  it('refuses a request with the wrong cron secret, even asking for a rebuild', async () => {
    const response = await GET(request('Bearer wrong', '?mode=rebuild'));
    expect(response.status).toBe(401);
    expect(mocks.ingestConnectorDirectory).not.toHaveBeenCalled();
  });

  it('runs an incremental refresh within the route budget', async () => {
    mocks.ingestConnectorDirectory.mockResolvedValue({ upserted: 7, removed: 0 });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ upserted: 7, removed: 0 });
    expect(mocks.ingestConnectorDirectory).toHaveBeenCalledWith({
      budget: mocks.budget,
      rebuild: false,
    });
  });

  it('runs a rebuild when asked for one', async () => {
    mocks.ingestConnectorDirectory.mockResolvedValue({ upserted: 1, removed: 2 });
    const response = await GET(request(`Bearer ${SECRET}`, '?mode=rebuild'));
    expect(response.status).toBe(200);
    expect(mocks.ingestConnectorDirectory).toHaveBeenCalledWith({
      budget: mocks.budget,
      rebuild: true,
    });
  });

  it('passes an application refusal through with its status', async () => {
    mocks.ingestConnectorDirectory.mockRejectedValue(createError.conflict('Already running'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Already running' });
  });

  it('answers 500 for an unexpected failure', async () => {
    mocks.ingestConnectorDirectory.mockRejectedValue(new Error('boom'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
