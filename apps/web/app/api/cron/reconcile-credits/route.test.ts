import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    processPendingSettlements: vi.fn(),
  },
}));

import { CreditService } from '@/lib/services/credit-service';
import { GET } from './route';

const processPending = vi.mocked(CreditService.processPendingSettlements);

function cronRequest(secret?: string): Request {
  return new Request('https://agiworkforce.com/api/cron/reconcile-credits', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe('GET /api/cron/reconcile-credits', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    processPending.mockResolvedValue({
      processed: 4,
      succeeded: 2,
      pending: 1,
      terminal: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects unauthorized callers without touching billing state', async () => {
    const response = await GET(cronRequest() as never);
    expect(response.status).toBe(401);
    expect(processPending).not.toHaveBeenCalled();
  });

  it('processes a bounded durable settlement batch for an authorized cron', async () => {
    const response = await GET(cronRequest('cron-secret') as never);
    expect(response.status).toBe(200);
    expect(processPending).toHaveBeenCalledWith(100);
    await expect(response.json()).resolves.toEqual({
      processed: 4,
      succeeded: 2,
      pending: 1,
      terminal: 1,
    });
  });

  it('returns 500 so the scheduler can observe and retry infrastructure failure', async () => {
    processPending.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(cronRequest('cron-secret') as never);
    expect(response.status).toBe(500);
  });
});
