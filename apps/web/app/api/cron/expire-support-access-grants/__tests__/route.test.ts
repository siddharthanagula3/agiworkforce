import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  expireStaleSupportAccessGrants: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIpForRateLimit: vi.fn(() => '203.0.113.7'),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => mocks.db,
}));
vi.mock('@/lib/server/support-access-service', () => ({
  expireStaleSupportAccessGrants: mocks.expireStaleSupportAccessGrants,
}));

import { logger } from '@/lib/logger';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';
import { GET } from '../route';

const SECRET = 'cron-secret-with-at-least-thirty-two-chars';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/expire-support-access-grants', {
    headers: authorization ? { authorization } : {},
  });
}

describe('/api/cron/expire-support-access-grants', () => {
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
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.expireStaleSupportAccessGrants).not.toHaveBeenCalled();
  });

  it('refuses a request with the wrong cron secret', async () => {
    const response = await GET(request('Bearer not-the-secret'));

    expect(response.status).toBe(401);
    expect(mocks.expireStaleSupportAccessGrants).not.toHaveBeenCalled();
  });

  it('closes lapsed grants and reports how many', async () => {
    mocks.expireStaleSupportAccessGrants.mockResolvedValue({ expired: 3, failed: 0, more: false });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 3, failed: 0, more: false });
    expect(mocks.expireStaleSupportAccessGrants).toHaveBeenCalledWith(mocks.db);
    expect(logger.info).toHaveBeenCalledWith(
      { expired: 3 },
      expect.stringContaining('support access grants'),
    );
  });

  it('answers 200 and logs nothing when there is nothing to close', async () => {
    mocks.expireStaleSupportAccessGrants.mockResolvedValue({ expired: 0, failed: 0, more: false });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 0, failed: 0, more: false });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('says so when the batch was full and grants remain', async () => {
    mocks.expireStaleSupportAccessGrants.mockResolvedValue({ expired: 100, failed: 0, more: true });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expired: 100, failed: 0, more: true });
    expect(logger.warn).toHaveBeenCalledWith(
      { expired: 100 },
      expect.stringContaining('batch size'),
    );
  });

  it('fails the run when some grants could not be closed, and still reports the rest', async () => {
    mocks.expireStaleSupportAccessGrants.mockResolvedValue({ expired: 2, failed: 1, more: false });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Some grants could not be closed',
      expired: 2,
      failed: 1,
      more: false,
    });
    expect(logger.error).toHaveBeenCalledWith(
      { expired: 2, failed: 1, more: false },
      expect.stringContaining('left grants approved'),
    );
  });

  it('answers 500 without leaking the failure when the sweep cannot start', async () => {
    mocks.expireStaleSupportAccessGrants.mockRejectedValue(
      new Error('connection reset by db-host-9'),
    );

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
