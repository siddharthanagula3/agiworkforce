import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getSharedSchedule: vi.fn(),
  neonDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.neonDb }));
vi.mock('@/lib/services/schedule-share-service', () => ({
  getSharedSchedule: mocks.getSharedSchedule,
}));

import { GET } from '../route';

function call(token: string) {
  return GET(new NextRequest(`http://localhost/api/schedule-shares/${token}`), {
    params: Promise.resolve({ token }),
  });
}

describe('GET /api/schedule-shares/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
  });

  it('returns the rate limit response before looking the token up', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call('tok-1');

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'share-view');
    expect(mocks.getSharedSchedule).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown or revoked token', async () => {
    mocks.getSharedSchedule.mockResolvedValue(null);

    const response = await call('tok-missing');

    expect(response.status).toBe(404);
    expect(mocks.getSharedSchedule).toHaveBeenCalledWith(mocks.neonDb, 'tok-missing');
  });

  it('returns the shared schedule for a live token', async () => {
    const share = { name: 'Weekly digest', cron: '0 9 * * 1', prompt: 'Summarize' };
    mocks.getSharedSchedule.mockResolvedValue(share);

    const response = await call('tok-1');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ share });
    expect(mocks.getSharedSchedule).toHaveBeenCalledWith(mocks.neonDb, 'tok-1');
  });
});
