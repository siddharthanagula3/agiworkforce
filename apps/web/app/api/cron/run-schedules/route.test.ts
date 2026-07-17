import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/services/schedule-service', () => ({
  processDueScheduleRuns: vi.fn(),
}));

import { processDueScheduleRuns } from '@/lib/services/schedule-service';
import { GET } from './route';

const processDue = vi.mocked(processDueScheduleRuns);

function request(secret?: string): Request {
  return new Request('https://agiworkforce.com/api/cron/run-schedules', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe('GET /api/cron/run-schedules', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    processDue.mockResolvedValue({
      claimed: 2,
      succeeded: 1,
      failed: 1,
      timedOut: 0,
      cancelled: 0,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('fails closed for an unauthorized cron request', async () => {
    const response = await GET(request() as never);
    expect(response.status).toBe(401);
    expect(processDue).not.toHaveBeenCalled();
  });

  it('executes a bounded batch for an authorized cron request', async () => {
    const response = await GET(request('cron-secret') as never);
    expect(response.status).toBe(200);
    expect(processDue).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, concurrency: 10, timeoutMs: 40_000 }),
    );
  });

  it('returns 500 so Vercel observes an infrastructure failure and retries later', async () => {
    processDue.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(request('cron-secret') as never);
    expect(response.status).toBe(500);
  });
});
