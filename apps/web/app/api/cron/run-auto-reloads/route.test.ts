import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/auto-reload-service');

const mocks = vi.hoisted(() => ({
  sweepAutoReloads: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/auto-reload-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  sweepAutoReloads: mocks.sweepAutoReloads,
}));

import { GET } from './route';
import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';

const CRON_SECRET = 'auto-reload-cron-secret-0123456789abcdef';
const NOW = Date.parse('2026-09-27T12:00:00.000Z');

function cron(secret: string | null = CRON_SECRET) {
  return new NextRequest('https://agiworkforce.com/api/cron/run-auto-reloads', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', CRON_SECRET);
  resetCronAuthThrottleForTests();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  mocks.sweepAutoReloads.mockResolvedValue({
    considered: 12,
    errored: 0,
    drained: true,
    outcomes: { above_threshold: 9, charged: 2, daily_limit: 1 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('GET /api/cron/run-auto-reloads', () => {
  it('refuses a request without the cron secret and charges nobody', async () => {
    expect((await GET(cron(null))).status).toBe(401);
    expect((await GET(cron('a-wrong-cron-secret'))).status).toBe(401);
    expect(mocks.sweepAutoReloads).not.toHaveBeenCalled();
  });

  it('sweeps under a four-minute budget inside the five-minute function limit', async () => {
    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      considered: 12,
      errored: 0,
      drained: true,
      outcomes: { above_threshold: 9, charged: 2, daily_limit: 1 },
    });
    expect(mocks.sweepAutoReloads).toHaveBeenCalledWith(NOW + 240_000);
  });

  it('reports a sweep that ran out of budget with accounts unvisited', async () => {
    mocks.sweepAutoReloads.mockResolvedValueOnce({
      considered: 5_000,
      errored: 3,
      drained: false,
      outcomes: { charged: 40 },
    });

    const response = await GET(cron());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ drained: false, errored: 3 });
  });

  it('answers 500 when the sweep itself fails', async () => {
    mocks.sweepAutoReloads.mockRejectedValueOnce(new Error('auto_reload_settings missing'));

    const response = await GET(cron());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Auto-reload sweep failed' });
  });
});
