
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  sweepExpiredHandoffs: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mocks.verifyCronRequest }));
vi.mock('@/lib/support/handoff/handoff-service', () => ({
  sweepExpiredHandoffs: mocks.sweepExpiredHandoffs,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/expire-support-handoffs') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.sweepExpiredHandoffs.mockResolvedValue({ expiredEmailed: 2, idleClosed: 1, purged: 5 });
});

describe('GET /api/cron/expire-support-handoffs', () => {
  it('401s and sweeps NOTHING without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.sweepExpiredHandoffs).not.toHaveBeenCalled();
  });

  it('runs the sweep and reports what it did', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ expiredEmailed: 2, idleClosed: 1, purged: 5 });
    expect(mocks.sweepExpiredHandoffs).toHaveBeenCalledTimes(1);
  });

  it('does not crash the schedule when the sweep fails', async () => {
    mocks.sweepExpiredHandoffs.mockRejectedValue(new Error('neon down'));

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
